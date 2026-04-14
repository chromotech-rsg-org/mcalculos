import { ExtractedMonth, ExtractedField, PayslipEvent, ExtractionTemplate } from '@/types';
import { TextItem, LayoutLine, groupIntoLines, findColumnX, classifyValueColumn } from './pdf-layout';

export interface Pattern1aResult {
  employeeName: string;
  cnpj: string;
  months: ExtractedMonth[];
}

const MONTH_NAMES: Record<string, string> = {
  'janeiro': '01', 'fevereiro': '02', 'marco': '03', 'março': '03',
  'abril': '04', 'maio': '05', 'junho': '06',
  'julho': '07', 'agosto': '08', 'setembro': '09',
  'outubro': '10', 'novembro': '11', 'dezembro': '12',
  // Abbreviated month names
  'jan': '01', 'fev': '02', 'mar': '03', 'abr': '04', 'mai': '05', 'jun': '06',
  'jul': '07', 'ago': '08', 'set': '09', 'out': '10', 'nov': '11', 'dez': '12',
};

const MONTH_LABELS: Record<string, string> = {
  'janeiro': 'Janeiro', 'fevereiro': 'Fevereiro', 'marco': 'Março', 'março': 'Março',
  'abril': 'Abril', 'maio': 'Maio', 'junho': 'Junho',
  'julho': 'Julho', 'agosto': 'Agosto', 'setembro': 'Setembro',
  'outubro': 'Outubro', 'novembro': 'Novembro', 'dezembro': 'Dezembro',
};

// ======== Helpers ========

/** Known labels that should NOT be treated as values */
const KNOWN_LABELS = /^(Empresa|CNPJ|Nome|Matr[ií]cula|Mat\.|Fun[cç][aã]o|Cargo|Bairro|Cidade|CEP|UF|Endere[cç]o|PIS|CPF|Identidade|Data\s*(Cr[eé]dito|Admiss[aã]o)|Dep\.?\s*sal|Banco|Ag[eê]ncia|C\/C|Conta|Compet[eê]ncia|Registro|Sal[aá]rio|Ref|Proventos|Descontos|Vencimentos|Discrimina|Evento|C[oó]digo|Descri[cç]|Local|Composi[cç]|IR$|Demonstrativo|Pagamento|Mensal|Total|Folha|Mensalista|Horista|Centro|Custo|Cadastro)$/i;

/** Check if a string looks like a pure value (not a label) */
const isValue = (s: string): boolean => {
  const trimmed = s.trim();
  if (!trimmed) return false;
  if (KNOWN_LABELS.test(trimmed)) return false;
  return true;
};

/**
 * Heuristic: classify an event as DESCONTO based on its code and description.
 * Codes 2xxx = discount; description containing "Desc"/"INSS"/"IRRF" (without "Base") = discount.
 */
const isDescontoByCode = (codigo: string, descricao: string): boolean => {
  const code = parseInt(codigo, 10);
  if (code >= 2000 && code < 3000) return true;
  // Normalize spaced-out text: "I N S S" → "INSS", "I R R F" → "IRRF"
  const normalized = descricao.replace(/\b([A-Z])\s+(?=[A-Z]\b)/gi, '$1');
  if (/\bDesc\.\s|Descto\.?|Desconto/i.test(normalized)) return true;
  if (/\bINSS\b/i.test(normalized) && !/\bBase\b/i.test(normalized)) return true;
  if (/\bIRRF\b/i.test(normalized) && !/\bBase\b/i.test(normalized)) return true;
  if (/Contribui[cç][aã]o\s+Assistencial/i.test(normalized)) return true;
  if (/\bMENSALIDADE\b.*\bSINDICAL\b/i.test(normalized)) return true;
  if (/\bLIQUIDO\b.*\b(FER|ADICIONAL|13)/i.test(normalized)) return true;
  if (/\bPENS[AÃ]O\b/i.test(normalized)) return true;
  if (/\bVALE\s+(TRANSPORTE|REFEI)/i.test(normalized)) {
    // Only classify as desconto if description explicitly contains "DESCONTO" or "DESC"
    // Without explicit marker, let positional logic decide (avoids misclassifying proventos)
    if (/DESC/i.test(normalized)) return true;
    return false;
  }
  if (/\bEMPR[EÉ]STIMO\b/i.test(normalized)) return true;
  if (/\bADIANTAMENTO\b/i.test(normalized)) return true;
  if (/\bCONTRIBUI[CÇ][AÃ]O\b/i.test(normalized) && !/\bBase\b/i.test(normalized)) return true;
  return false;
};

/** Try to find a labeled value on a line: "Label: Value" or "Label  Value" */
const findLabeledValue = (lines: LayoutLine[], labelRegex: RegExp, startIdx = 0, endIdx?: number): string => {
  const end = endIdx ?? lines.length;
  for (let i = startIdx; i < end; i++) {
    const text = lines[i].text;
    const match = text.match(labelRegex);
    if (match) return (match[1] || '').trim();
    
    // Also try item-by-item: label item followed by value item
    const items = lines[i].items;
    for (let j = 0; j < items.length; j++) {
      if (labelRegex.test(items[j].str)) {
        // Next non-empty item on same line is likely the value
        for (let k = j + 1; k < items.length; k++) {
          const val = items[k].str.trim();
          if (val && isValue(val)) {
            return val;
          }
        }
      }
    }
  }
  return '';
};

// (extractDynamicFields removed - replaced by extractAllFields below)

/**
 * Find the X position of a label in a line's items, handling multi-word labels.
 * For combined items, only matches when the regex matches at the START of the combination.
 */
const findLabelXInItems = (items: TextItem[], labelRegex: RegExp): number => {
  // Strategy 1: single item match — return CENTER of matched item
  for (const it of items) {
    if (labelRegex.test(it.str.trim())) return it.x + it.width / 2;
  }
  // Strategy 2: combined consecutive items (match must start near index 0)
  for (let j = 0; j < items.length; j++) {
    for (let len = 2; len <= Math.min(5, items.length - j); len++) {
      const combined = items.slice(j, j + len).map(it => it.str).join(' ');
      const match = combined.match(labelRegex);
      if (match && match.index !== undefined && match.index <= 2) {
        // Return center of the span of matched items
        const lastItem = items[j + len - 1];
        return (items[j].x + lastItem.x + lastItem.width) / 2;
      }
    }
  }
  return -1;
};

/**
 * Get value aligned with a label by X position (same line after label, or next line closest by X).
 */
const getAlignedValue = (lines: LayoutLine[], lineIdx: number, labelRegex: RegExp): string => {
  const items = lines[lineIdx].items;
  const labelX = findLabelXInItems(items, labelRegex);
  if (labelX < 0) return '';

  // Same line: value right after label
  const sameLineVals = items
    .filter(it => it.x > labelX + 20 && /^[\d.,]+$/.test(it.str.trim()) && it.str.trim().includes(','))
    .sort((a, b) => a.x - b.x);
  if (sameLineVals.length > 0 && sameLineVals[0].x - labelX < 150) {
    return sameLineVals[0].str.trim();
  }

  // Next line: closest value by X
  if (lineIdx + 1 < lines.length) {
    const nextVals = lines[lineIdx + 1].items
      .filter(it => /^[\d.,]+$/.test(it.str.trim()) && it.str.trim().length > 1)
      .sort((a, b) => Math.abs(a.x - labelX) - Math.abs(b.x - labelX));
    if (nextVals.length > 0 && Math.abs(nextVals[0].x - labelX) < 200) {
      return nextVals[0].str.trim();
    }
  }
  return '';
};

// ======== Block extractors ========

const extractHeader = (lines: LayoutLine[]): {
  empresa: string; cnpj: string; centroCusto: string;
  tipoFolha: string; competencia: string; period: string; folhaNumero: string;
  local: string;
} => {
  const result = { empresa: '', cnpj: '', centroCusto: '', tipoFolha: '', competencia: '', period: '', folhaNumero: '', local: '' };
  
  const headerEnd = Math.min(20, lines.length);
  
  for (let i = 0; i < headerEnd; i++) {
    const line = lines[i];
    const text = line.text;
    const items = line.items;
    
    // CNPJ - multiple formats (including "04.063.469/0002.01" with dot instead of dash)
    if (!result.cnpj) {
      // Normalize unicode dashes (en-dash, em-dash) to regular hyphen for matching
      const normalizedText = text.replace(/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g, '-');
      const cnpjMatch = normalizedText.match(/CNPJ[:\s]*([\d./-]+)/i) || normalizedText.match(/(\d{2}\.\d{3}\.\d{3}\/\d{4}[.-]\d{2})/);
      if (cnpjMatch) result.cnpj = cnpjMatch[1].trim();
    }
    
    // Empresa - look for labeled "Empresa" or "Razão Social" field
    if (!result.empresa) {
      // "Empresa" or "Razão Social" label followed by value on same line (item-based)
      for (let j = 0; j < items.length; j++) {
        if (/^(Empresa|Raz[aã]o\s+Social)$/i.test(items[j].str.trim())) {
          // Collect next items until we hit another label or CNPJ
          const parts: string[] = [];
          for (let k = j + 1; k < items.length; k++) {
            const val = items[k].str.trim();
            if (!val || /^CNPJ$/i.test(val) || /^\d{2}\.\d{3}/.test(val)) break;
            parts.push(val);
          }
          if (parts.length > 0) {
            result.empresa = parts.join(' ').trim();
          }
          break;
        }
      }
      
      // Keypar format: "7 - COMERCIAL KEYPAR REPRES E SUPERM LTDA"
      if (!result.empresa) {
        const keyparMatch = text.match(/^\s*\d+\s*-\s*([A-ZÀ-Ú][A-ZÀ-Ú\s.&]+(?:LTDA|S\.?A\.?|EIRELI|ME|EPP))/i);
        if (keyparMatch) {
          result.empresa = keyparMatch[1].trim();
        }
      }
      
      // Fallback: line after "Empresa" label or company name indicators
      if (!result.empresa) {
        // Try collapsing spaced-out company names first: "C O V A B R A  S U P E R ..." → "COVABRA SUPER..."
        let cleaned = text;
        // Detect spaced-out text: single letters separated by spaces (at least 4 in a row)
        const spacedMatch = cleaned.match(/(?:[A-ZÀ-Ú]\s){4,}[A-ZÀ-Ú]/);
        if (spacedMatch) {
          // Collapse: remove spaces between single letters
          cleaned = cleaned.replace(/\b([A-ZÀ-Ú])\s+(?=[A-ZÀ-Ú]\b)/g, '$1');
        }
        cleaned = cleaned.replace(/[\d./-]+/g, '').replace(/CNPJ|Codigo|Folha|Mensalista|C[oó]digo|Descri[cç]|Evento|Discrimina|Demonstrativo|Pagamento|Mensal/gi, '').trim();
        if (cleaned.length > 5 && /[A-ZÀ-Ú]{2,}/.test(cleaned)) {
          if (/LTDA|S\.?A\.?|EIRELI|ME\b|EPP|COMERCIAL|IND|COM\b|CENTRO|UNIFICADO|FEDERAL|SERVICO|GRUPO|SUPERMERCADO/i.test(cleaned)) {
            result.empresa = cleaned;
          }
        }
      }
    }
    
    // If we find "Empresa" or "Razão Social" label on this line and value on next line
    if (!result.empresa && /^(Empresa|Raz[aã]o\s+Social)$/i.test(text.trim()) && i + 1 < headerEnd) {
      const nextText = lines[i + 1].text.replace(/CNPJ.*$/i, '').trim();
      if (nextText.length > 3) {
        // Check for Keypar "number - name" format on the next line
        const keyparNext = nextText.match(/^\s*\d+\s*-\s*(.+)/);
        result.empresa = keyparNext ? keyparNext[1].trim() : nextText;
      }
    }
    
    // EMPRESA / RAZÃO SOCIAL label on a separate line with value on a different nearby line
    if (!result.empresa && /^(EMPRESA|RAZ[AÃ]O\s+SOCIAL)$/i.test(text.trim())) {
      // Scan next few lines for a company-like name
      for (let k = i + 1; k < Math.min(i + 4, headerEnd); k++) {
        const nearText = lines[k].text.trim();
        // Skip labels
        if (/^(CNPJ|CADASTRO|NOME|LOCAL|CARGO|CBO|MÊS)/i.test(nearText)) continue;
        // Keypar format: "7 - COMPANY NAME"
        const kpMatch = nearText.match(/^\d+\s*-\s*(.+)/);
        if (kpMatch) { result.empresa = kpMatch[1].trim(); break; }
        if (nearText.length > 5 && /[A-ZÀ-Ú]{3,}/.test(nearText) && /LTDA|COMERCIAL|IND|COM\b|S\.?A/i.test(nearText)) {
          result.empresa = nearText; break;
        }
      }
    }
    
    // LOCAL label (Keypar: "LJ UBA1 -FISCAL DE LOJA JUNIOR")
    if (!result.local) {
      if (/^LOCAL$/i.test(text.trim())) {
        for (let k = i + 1; k < Math.min(i + 4, headerEnd); k++) {
          const nearText = lines[k].text.trim();
          if (/^(CNPJ|CADASTRO|NOME|EMPRESA|CARGO|CBO|MÊS|CÓD)/i.test(nearText)) continue;
          if (nearText.length > 3 && !/^[\d./-]+$/.test(nearText)) {
            result.local = nearText; break;
          }
        }
      } else {
        const localMatch = text.match(/\bLOCAL\s+(.+)/i);
        if (localMatch && localMatch[1].trim().length > 3) {
          result.local = localMatch[1].trim();
        }
      }
    }
    
    // Centro de Custo
    if (!result.centroCusto) {
      const ccMatch = text.match(/(?:Centro\s+(?:de\s+)?Custo|CC)[:\s]*([A-ZÀ-Úa-zà-ú\s]+?)(?:\s+Folha|\s+\d|\s*$)/i);
      if (ccMatch) result.centroCusto = ccMatch[1].trim();
    }
    
    // Tipo Folha
    if (!result.tipoFolha) {
      if (/Folha\s+(Mensal|Complementar|Pagamento)/i.test(text)) {
        const m = text.match(/Folha\s+(Mensal|Complementar|Pagamento|\w+)/i);
        if (m) result.tipoFolha = m[0].trim();
      } else if (/Mensalista|Horista/i.test(text)) {
        const m = text.match(/(Mensalista|Horista)/i);
        if (m) result.tipoFolha = m[1];
      } else if (/Demonstrativo\s+de\s+Pagamento\s+(Mensal|de\s+Sal[aá]rio)/i.test(text)) {
        result.tipoFolha = 'Demonstrativo de Pagamento';
      }
    }
    
    // Competencia (month/year) - multiple formats
    if (!result.competencia) {
      // "Janeiro de 2024" or "Janeiro 2024" format
      const compMatch = text.match(/(Janeiro|Fevereiro|Mar[cç]o|Abril|Maio|Junho|Julho|Agosto|Setembro|Outubro|Novembro|Dezembro)\s+(?:de\s+)?(\d{4})/i);
      if (compMatch) {
        const monthKey = compMatch[1].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const monthNum = MONTH_NAMES[monthKey] || '??';
        const label = MONTH_LABELS[monthKey] || compMatch[1];
        result.competencia = `${label} de ${compMatch[2]}`;
        result.period = `${monthNum}/${compMatch[2]}`;
      }
      
      // "MARÇO/2021" or "Referência: MARÇO/2021" - month name with slash
      if (!result.period) {
        const monthSlashMatch = text.match(/(?:Refer[eê]ncia|Compet[eê]ncia)?[:\s]*(Janeiro|Fevereiro|Mar[cç]o|Abril|Maio|Junho|Julho|Agosto|Setembro|Outubro|Novembro|Dezembro)\s*\/\s*(\d{4})/i);
        if (monthSlashMatch) {
          const monthKey = monthSlashMatch[1].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
          const monthNum = MONTH_NAMES[monthKey] || '??';
          const label = MONTH_LABELS[monthKey] || monthSlashMatch[1];
          result.competencia = `${label} de ${monthSlashMatch[2]}`;
          result.period = `${monthNum}/${monthSlashMatch[2]}`;
        }
      }
      
      // "REFERÊNCIA OUT/2017" or "Referência SET/2017" - abbreviated month with slash
      if (!result.period) {
        const abbrMonthMatch = text.match(/(?:Refer[eê]ncia|Compet[eê]ncia|REFER[EÊ]NCIA)[:\s]*(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)\s*\/\s*(\d{4})/i);
        if (abbrMonthMatch) {
          const monthKey = abbrMonthMatch[1].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
          const monthNum = MONTH_NAMES[monthKey] || '??';
          result.competencia = `${monthNum}/${abbrMonthMatch[2]}`;
          result.period = `${monthNum}/${abbrMonthMatch[2]}`;
        }
      }
      
      // "01/2024" or "Competência: 01/2024" or "Referência: 08/2023" format
      if (!result.period) {
        const numCompMatch = text.match(/(?:Compet[eê]ncia|Per[ií]odo|Refer[eê]ncia)[:\s]*(\d{1,2})\s*\/\s*(\d{4})/i);
        if (numCompMatch) {
          const m = numCompMatch[1].padStart(2, '0');
          result.period = `${m}/${numCompMatch[2]}`;
          if (!result.competencia) result.competencia = `${m}/${numCompMatch[2]}`;
        }
      }
      
      // "MÊS/ANO" label on this line with value nearby (e.g. "MÊS/ANO 03 / 2019")
      if (!result.period && !/Evento|Discrimina/i.test(text)) {
        const mesAnoMatch = text.match(/M[eêÊ]S\s*\/\s*ANO\s*[:\s]*(\d{1,2})\s*\/\s*(\d{4})/i);
        if (mesAnoMatch) {
          const m = mesAnoMatch[1].padStart(2, '0');
          result.period = `${m}/${mesAnoMatch[2]}`;
          if (!result.competencia) result.competencia = `${m}/${mesAnoMatch[2]}`;
        }
      }
      
      // "MÊS/ANO" label with month and year on separate nearby lines
      // Keypar rotated: items "03", "/", "2019" at similar X but different Y,
      // which means they appear on different "lines" and may be before OR after MÊS/ANO line
      if (!result.period && /M[eêÊ]S\s*\/\s*ANO/i.test(text) && !/Evento|Discrimina/i.test(text)) {
        let foundMonth = '';
        let foundYear = '';
        // Scan nearby lines in BOTH directions (up to 8 before and 8 ahead)
        const scanStart = Math.max(0, i - 8);
        const scanEnd = Math.min(i + 8, headerEnd);
        for (let k = scanStart; k < scanEnd; k++) {
          const nearText = lines[k].text.trim();
          // Look for "/ YYYY" pattern
          if (!foundYear) {
            const yearMatch = nearText.match(/\/\s*(\d{4})/);
            if (yearMatch) foundYear = yearMatch[1];
          }
          // Look for standalone year (e.g., "2019" on its own line)
          if (!foundYear) {
            for (const item of lines[k].items) {
              const trimmed = item.str.trim();
              if (/^\d{4}$/.test(trimmed) && parseInt(trimmed) >= 2000 && parseInt(trimmed) <= 2099) {
                foundYear = trimmed;
                break;
              }
            }
          }
          // Look for standalone month digit (1-12)
          if (!foundMonth) {
            for (const item of lines[k].items) {
              const trimmed = item.str.trim();
              if (/^\d{1,2}$/.test(trimmed) && parseInt(trimmed) >= 1 && parseInt(trimmed) <= 12) {
                foundMonth = trimmed;
                break;
              }
            }
          }
        }
        if (foundMonth && foundYear) {
          const m = foundMonth.padStart(2, '0');
          result.period = `${m}/${foundYear}`;
          if (!result.competencia) result.competencia = `${m}/${foundYear}`;
        }
      }
      
      // "13° 12-2021" or "13o 12/2021" format (13th salary)
      if (!result.period) {
        const trezeMatch = text.match(/13[º°o]\s*(\d{1,2})\s*[-/]\s*(\d{4})/i);
        if (trezeMatch) {
          const m = trezeMatch[1].padStart(2, '0');
          result.period = `13°-${m}/${trezeMatch[2]}`;
          if (!result.competencia) result.competencia = `13° ${m}/${trezeMatch[2]}`;
        }
      }
      
      // Standalone abbreviated month/year (e.g., "OUT/2017", "SET/2017" without label)
      if (!result.period) {
        const abbrStandalone = text.match(/\b(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)\s*\/\s*(\d{4})\b/i);
        if (abbrStandalone) {
          const monthKey = abbrStandalone[1].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
          const monthNum = MONTH_NAMES[monthKey] || '??';
          result.competencia = `${monthNum}/${abbrStandalone[2]}`;
          result.period = `${monthNum}/${abbrStandalone[2]}`;
        }
      }
      
      // Standalone MM/YYYY in header (with optional spaces: "03 / 2019" or "03/2019")
      // But avoid capturing dates from judicial protocol headers (first line)
      // Also skip dates that look like admission dates (DD/MM/YYYY where DD > 12)
      if (!result.period && i > 0) {
        const standaloneMatch = text.match(/\b(\d{1,2})\s*\/\s*(\d{4})\b/);
        if (standaloneMatch) {
          const monthNum = parseInt(standaloneMatch[1]);
          // Only accept as period if it looks like MM/YYYY (month 1-12)
          // and the surrounding text doesn't look like a date (DD/MM/YYYY)
          if (monthNum >= 1 && monthNum <= 12 && !/\d{2}\/\d{2}\/\d{4}/.test(text)) {
            const m = standaloneMatch[1].padStart(2, '0');
            result.period = `${m}/${standaloneMatch[2]}`;
            if (!result.competencia) result.competencia = `${m}/${standaloneMatch[2]}`;
          }
        }
      }
    }
    
    // Folha numero
    if (!result.folhaNumero) {
      const folhaNumMatch = text.match(/(?:Folha\s+\w+\s+.*?)(\d{2,4})\s+\d{3}\s+[A-Z]/i);
      if (folhaNumMatch) result.folhaNumero = folhaNumMatch[1];
    }
  }
  
  return result;
};

const extractEmployee = (lines: LayoutLine[]): {
  codigo: string; nome: string; cbo: string; departamento: string;
  filial: string; cargo: string; dataAdmissao: string;
  endereco: string; bairro: string; cidade: string; cep: string; uf: string;
  pis: string; cpf: string; identidade: string; dataCredito: string; depSalFam: string;
  depIR: string; depSF: string;
} => {
  const result = {
    codigo: '', nome: '', cbo: '', departamento: '', filial: '',
    cargo: '', dataAdmissao: '', endereco: '', bairro: '', cidade: '',
    cep: '', uf: '', pis: '', cpf: '', identidade: '', dataCredito: '', depSalFam: '',
    depIR: '', depSF: '',
  };

  // Find the table header line to know where employee zone ends
  let tableHeaderIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const text = lines[i].text;
    if (
      (/C[oó]d(?:igo)?\.?/i.test(text) && /Descri[cç][aã]o/i.test(text)) ||
      (/C[oó]d(?:igo)?\.?/i.test(text) && /Vencimento(?:s)?|Proventos/i.test(text)) ||
      (/Evento/i.test(text) && /Discrimina[cç][aã]o/i.test(text)) ||
      (/Evento/i.test(text) && /Proventos/i.test(text)) ||
      (/\bVerba\b/i.test(text) && /Descri[cç][aã]o/i.test(text)) ||
      (/\bVerba\b/i.test(text) && /Vencimento(?:s)?/i.test(text)) ||
      (/\bCONTA\b/i.test(text) && /Vencimento(?:s)?/i.test(text) && /Desconto(?:s)?/i.test(text))
    ) {
      tableHeaderIdx = i;
      break;
    }
  }
  
  const searchEnd = tableHeaderIdx > 0 ? tableHeaderIdx : Math.min(25, lines.length);
  
  // Keypar-specific: CADASTRO + NOME labels on one line, values on a nearby line
  // Pattern: "CADASTRO NOME" then "000009717 JOSE DE RIBAMAR BARTHOLOMEU BO 20/04/2015"
  for (let i = 0; i < searchEnd; i++) {
    const text = lines[i].text;
    if (/CADASTRO/i.test(text) && /NOME/i.test(text)) {
      // Scan next few lines for the data
      for (let k = i + 1; k < Math.min(i + 5, searchEnd); k++) {
        const dataText = lines[k].text.trim();
        // Match: code (6+ digits) + name + date
        const cadastroMatch = dataText.match(/^(\d{4,})\s+([A-ZÀ-Úa-zà-ú][A-ZÀ-Úa-zà-ú\s.]+?)\s+(\d{2}\/\d{2}\/\d{4})/);
        if (cadastroMatch) {
          if (!result.codigo) result.codigo = cadastroMatch[1];
          if (!result.nome) result.nome = cadastroMatch[2].trim();
          if (!result.dataAdmissao) result.dataAdmissao = cadastroMatch[3];
          break;
        }
      }
      break;
    }
  }
  
  // Keypar-specific: CARGO + CBO labels on one line, values on nearby line
  for (let i = 0; i < searchEnd; i++) {
    const text = lines[i].text;
    if (/\bCARGO\b/i.test(text) && /\bCBO\b/i.test(text)) {
      for (let k = i + 1; k < Math.min(i + 4, searchEnd); k++) {
        const dataText = lines[k].text.trim();
        // Match: cargo name + CBO number (6 digits)
        const cargoMatch = dataText.match(/^([A-ZÀ-Ú][A-ZÀ-Úa-zà-ú\s.\/\-]+?)\s+(\d{6})$/);
        if (cargoMatch) {
          if (!result.cargo) result.cargo = cargoMatch[1].trim();
          if (!result.cbo) result.cbo = cargoMatch[2];
          break;
        }
      }
    }
  }
  
  for (let i = 0; i < searchEnd; i++) {
    const line = lines[i];
    const items = line.items;
    const text = line.text;
    
    // === Strategy 1: Labeled fields (Matrícula, Nome, Função, etc.) ===
    
    // Matrícula / Registro / Código do funcionário
    if (!result.codigo) {
      const matMatch = text.match(/(?:Matr[ií]cula|Registro|Mat\.?)[:\s]*(\d+)/i);
      if (matMatch) result.codigo = matMatch[1];
    }
    
    // Nome - labeled
    if (!result.nome) {
      // Item-based: find "Nome" label and collect items after it
      for (let j = 0; j < items.length; j++) {
        if (/^(Nome|Trabalhador)$/i.test(items[j].str.trim())) {
          const parts: string[] = [];
          for (let k = j + 1; k < items.length; k++) {
            const val = items[k].str.trim();
            if (!val) continue;
            // Stop at next label or numeric-only
            if (/^(Matr|Cargo|Fun[cç]|Data|Admiss|Endere|Bairro|Cidade|CEP|UF|PIS|CPF|Ident)/i.test(val)) break;
            if (/^\d{2}\/\d{2}\/\d{4}$/.test(val)) break;
            parts.push(val);
          }
          if (parts.length > 0) {
            result.nome = parts.join(' ').trim();
          }
          break;
        }
      }
      // Regex fallback
      if (!result.nome) {
        const nomeMatch = text.match(/(?:Nome|Funcion[aá]rio|Trabalhador)[:\s]*([A-ZÀ-Ú][A-ZÀ-Úa-zà-ú\s.]+?)(?:\s+Matr|\s+CPF|\s+PIS|\s*$)/i);
        if (nomeMatch) result.nome = nomeMatch[1].trim();
      }
    }
    
    // Cargo / Função
    if (!result.cargo) {
      // Item-based: "Função" or "Cargo" label
      for (let j = 0; j < items.length; j++) {
        if (/^(Fun[cç][aã]o|Cargo|Cargo\s*\/\s*N[ií]vel)$/i.test(items[j].str.trim())) {
          const parts: string[] = [];
          for (let k = j + 1; k < items.length; k++) {
            const val = items[k].str.trim();
            if (!val) continue;
            // Stop at "Data Admissão" but not standalone "Data" that's part of cargo name
            if (/^Data\s*Admiss/i.test(val)) break;
            if (/^Data$/i.test(val)) {
              // Peek at next item — if it starts with "Admiss" it's the label, not cargo
              const next = items[k + 1]?.str.trim() || '';
              if (/^Admiss/i.test(next) || /^\d{2}\/\d{2}\/\d{4}$/.test(next)) break;
            }
            if (/^(Endere[cç]o|Bairro|Cidade|Sal[aá]rio|CEP|UF|PIS|CPF|Identidade|Matr[ií]cula|Nome|Registro|Banco|Ag[eê]ncia)$/i.test(val)) break;
            if (/^\d{2}\/\d{2}\/\d{4}$/.test(val)) break;
            parts.push(val);
          }
          if (parts.length > 0) {
            result.cargo = parts.join(' ').trim();
          }
          break;
        }
      }
      // Regex fallback — handle "Data Admissão" boundary properly
      if (!result.cargo) {
        const cargoMatch = text.match(/(?:Cargo|Fun[cç][aã]o)[:\s]*([A-ZÀ-Úa-zà-ú\s.\/\-]+?)(?:\s+Data\s*Admiss|\s+Endere|\s+Sal[aá]rio|\s+\d{2}\/\d{2}\/\d{4}|\s*$)/i);
        if (cargoMatch && cargoMatch[1].trim().length > 1) result.cargo = cargoMatch[1].trim();
      }
    }
    
    // Data Admissão
    if (!result.dataAdmissao) {
      const admMatch = text.match(/(?:Data\s*(?:de\s*)?Admiss[aã]o|Admiss[aã]o|Adm\.?)[:\s]*(\d{2}\/\d{2}\/\d{4})/i);
      if (admMatch) result.dataAdmissao = admMatch[1];
    }
    
    // Endereço
    if (!result.endereco) {
      const endMatch = text.match(/Endere[cç]o[:\s]*(.+?)(?:\s+CEP|\s+Bairro|\s*$)/i);
      if (endMatch) result.endereco = endMatch[1].trim();
      else {
        for (let j = 0; j < items.length; j++) {
          if (/^Endere[cç]o$/i.test(items[j].str.trim())) {
            const parts: string[] = [];
            for (let k = j + 1; k < items.length; k++) {
              const val = items[k].str.trim();
              if (!val) continue;
              if (/^(CEP|Bairro|Cidade|UF)$/i.test(val)) break;
              parts.push(val);
            }
            if (parts.length > 0) result.endereco = parts.join(' ').trim();
            break;
          }
        }
      }
    }
    
    // Bairro
    if (!result.bairro) {
      for (let j = 0; j < items.length; j++) {
        if (/^Bairro$/i.test(items[j].str.trim())) {
          const parts: string[] = [];
          for (let k = j + 1; k < items.length; k++) {
            const val = items[k].str.trim();
            if (!val) continue;
            if (/^(Cidade|CEP|UF|Endere)$/i.test(val)) break;
            parts.push(val);
          }
          if (parts.length > 0) result.bairro = parts.join(' ').trim();
          break;
        }
      }
    }
    
    // Cidade
    if (!result.cidade) {
      for (let j = 0; j < items.length; j++) {
        if (/^Cidade$/i.test(items[j].str.trim())) {
          const parts: string[] = [];
          for (let k = j + 1; k < items.length; k++) {
            const val = items[k].str.trim();
            if (!val) continue;
            if (/^(CEP|UF|Bairro|Endere|PIS|CPF)$/i.test(val)) break;
            parts.push(val);
          }
          if (parts.length > 0) result.cidade = parts.join(' ').trim();
          break;
        }
      }
    }
    
    // CEP
    if (!result.cep) {
      const cepMatch = text.match(/CEP[:\s]*([\d.-]+)/i);
      if (cepMatch) result.cep = cepMatch[1].trim();
    }
    
    // UF
    if (!result.uf) {
      for (let j = 0; j < items.length; j++) {
        if (/^UF$/i.test(items[j].str.trim()) && j + 1 < items.length) {
          const val = items[j + 1].str.trim();
          if (val && val.length <= 3 && /^[A-Z]{2}$/i.test(val)) {
            result.uf = val.toUpperCase();
          }
          break;
        }
      }
    }
    
    // PIS
    if (!result.pis) {
      const pisMatch = text.match(/PIS[:\s]*([\d./-]+)/i);
      if (pisMatch) result.pis = pisMatch[1].trim();
    }
    
    // CPF
    if (!result.cpf) {
      const cpfMatch = text.match(/CPF[:\s]*([\d./-]+)/i);
      if (cpfMatch) result.cpf = cpfMatch[1].trim();
    }
    
    // Identidade / RG
    if (!result.identidade) {
      const idMatch = text.match(/(?:Identidade|RG)[:\s]*([\d./-]+)/i);
      if (idMatch) result.identidade = idMatch[1].trim();
    }
    
    // Data Crédito
    if (!result.dataCredito) {
      const dcMatch = text.match(/Data\s*Cr[eé]dito[:\s]*(\d{2}\/\d{2}\/\d{4})/i);
      if (dcMatch) result.dataCredito = dcMatch[1];
    }
    
    // Dep.sal.fam / Dependentes salário família
    if (!result.depSalFam) {
      const depMatch = text.match(/Dep\.?\s*sal\.?\s*f[aá]m\.?[:\s]*(\d+)/i);
      if (depMatch) result.depSalFam = depMatch[1];
    }
    
    // Dep IR (Dependentes IR)
    if (!result.depIR) {
      const depIRMatch = text.match(/Dep\.?\s*IR[:\s]*(\d+)/i);
      if (depIRMatch) result.depIR = depIRMatch[1];
      // Item-based: "Dep" + "IR" label then value
      if (!result.depIR) {
        for (let j = 0; j < items.length; j++) {
          const s = items[j].str.trim();
          if (/^Dep\.?\s*IR$/i.test(s) || (/^Dep\.?$/i.test(s) && j + 1 < items.length && /^IR$/i.test(items[j + 1].str.trim()))) {
            const startK = /^Dep\.?\s*IR$/i.test(s) ? j + 1 : j + 2;
            for (let k = startK; k < items.length; k++) {
              const val = items[k].str.trim();
              if (/^\d+$/.test(val)) { result.depIR = val; break; }
              if (val && !/^[:=]$/.test(val)) break;
            }
            break;
          }
        }
      }
    }
    
    // Dep SF (Dependentes Salário Família)
    if (!result.depSF) {
      const depSFMatch = text.match(/Dep\.?\s*SF[:\s]*(\d+)/i);
      if (depSFMatch) result.depSF = depSFMatch[1];
      // Item-based
      if (!result.depSF) {
        for (let j = 0; j < items.length; j++) {
          const s = items[j].str.trim();
          if (/^Dep\.?\s*SF$/i.test(s) || (/^Dep\.?$/i.test(s) && j + 1 < items.length && /^SF$/i.test(items[j + 1].str.trim()))) {
            const startK = /^Dep\.?\s*SF$/i.test(s) ? j + 1 : j + 2;
            for (let k = startK; k < items.length; k++) {
              const val = items[k].str.trim();
              if (/^\d+$/.test(val)) { result.depSF = val; break; }
              if (val && !/^[:=]$/.test(val)) break;
            }
            break;
          }
        }
      }
    }
    
    // === Strategy 2: Positional (code + name + CBO on same line) ===
    if (!result.codigo || !result.nome) {
      // Skip header/label lines
      if (/^(Empresa|CNPJ|Codigo\s+Centro|Folha\s|Centro\s+de\s+Custo|Compet|Demonstrativo)/i.test(text.trim())) continue;
      if (/^(Janeiro|Fevereiro|Mar[cç]o|Abril|Maio|Junho|Julho|Agosto|Setembro|Outubro|Novembro|Dezembro)\s/i.test(text.trim())) continue;
      
      const codeItems = items.filter(it => /^\d{1,6}$/.test(it.str.trim()));
      
      for (const codeItem of codeItems) {
        const code = codeItem.str.trim();
        
        const afterCode = items
          .filter(it => it.x > codeItem.x)
          .sort((a, b) => a.x - b.x);
        
        const nameParts: string[] = [];
        const numericParts: string[] = [];
        let foundCbo = false;
        
        for (const it of afterCode) {
          const val = it.str.trim();
          if (!val) continue;
          
          if (/^\d+$/.test(val)) {
            numericParts.push(val);
            if (val.length >= 4 && val.length <= 6) foundCbo = true;
          } else if (/^[A-ZÀ-Ú][A-ZÀ-Ú\s.]*$/i.test(val) && val.length >= 2) {
            if (numericParts.length === 0) {
              if (/[A-ZÀ-Ú]/.test(val)) nameParts.push(val);
            }
          }
        }
        
        if (nameParts.length > 0 && foundCbo) {
          if (!result.codigo) result.codigo = code;
          if (!result.nome) result.nome = nameParts.join(' ').trim();
          
          for (const num of numericParts) {
            if (!result.cbo && num.length >= 4 && num.length <= 6) {
              result.cbo = num;
            } else if (result.cbo && !result.departamento && num.length >= 1) {
              result.departamento = num;
            } else if (result.cbo && result.departamento && !result.filial) {
              result.filial = num;
            }
          }
          break;
        }
      }
    }
    
    // Strategy 3: regex fallback on concatenated text
    if (!result.codigo) {
      const empMatch = text.match(/\b(\d{1,6})\s+([A-ZÀ-Ú][A-ZÀ-Ú\s.]{3,}?)\s+(\d{4,6})\b/);
      if (empMatch) {
        result.codigo = empMatch[1];
        if (!result.nome) result.nome = empMatch[2].trim();
        result.cbo = empMatch[3];
        
        const afterCbo = text.substring(text.indexOf(empMatch[3]) + empMatch[3].length).trim();
        const deptFilMatch = afterCbo.match(/^(\d+)\s+(\d+)/);
        if (deptFilMatch) {
          result.departamento = deptFilMatch[1];
          result.filial = deptFilMatch[2];
        }
      }
    }
    
    // Cargo from line with admissão (original style)
    if (!result.cargo && !result.dataAdmissao) {
      const admMatch = text.match(/Admiss[aã]o[:\s]*(\d{2}\/\d{2}\/\d{4})/i);
      if (admMatch) {
        result.dataAdmissao = admMatch[1];
        const cargoText = text.substring(0, text.search(/Admiss[aã]o/i)).trim();
        if (cargoText) {
          result.cargo = cargoText.replace(/^\d+\s+/, '').trim();
        }
      }
    }
  }
  
  return result;
};

/**
 * Detect the table header line. Returns the index and column X positions.
 * Supports multiple header formats (Código/Cód., Evento, Discriminação, etc.)
 */
const detectEventHeader = (lines: LayoutLine[]): {
  headerIdx: number;
  vencX: number | null;
  descX: number | null;
  refX: number | null;
} => {
  for (let i = 0; i < lines.length; i++) {
    const text = lines[i].text;
    
    // Layout A: "Código" / "Cód." + "Descrição" + "Vencimentos/Proventos"
    const hasCodigo = /C[oó]d(?:igo)?\.?/i.test(text);
    const hasDescricao = /Descri[cç][aã]o/i.test(text);
    const hasVenc = /Vencimento(?:s)?|Proventos?/i.test(text);
    
    // Layout B: "Evento" + "Discriminação" + "Proventos"
    const hasEvento = /\bEvento\b/i.test(text);
    const hasDiscriminacao = /Discrimina[cç][aã]o/i.test(text);
    
    // Layout C: "Discriminação das parcelas" standalone header
    const hasDiscParcelas = /Discrimina[cç][aã]o\s+das\s+parcelas/i.test(text);

    // Layout D: "CÓD." + "REF" + "VENCIMENTOS" (abbreviated headers)
    const hasRef = /\bRef(?:er[eê]ncia)?\.?\b/i.test(text);
    const hasDescontos = /\bDesconto(?:s)?\b/i.test(text);
    
    // Layout E: "Verba" + "Descrição" + "Vencimento" (SBB format)
    const hasVerba = /\bVerba\b/i.test(text);
    
    // Layout F: "CONTA" + "VENCIMENTOS" + "DESCONTOS" (ADP/Indra format)
    const hasConta = /\bCONTA\b/i.test(text);
    
    const isHeader = 
      (hasCodigo && hasDescricao && hasVenc) ||
      (hasEvento && hasDiscriminacao && hasVenc) ||
      (hasDiscParcelas && hasVenc) ||
      (hasCodigo && hasVenc) ||
      (hasCodigo && hasDescontos) ||
      (hasEvento && hasVenc) ||
      (hasVerba && hasDescricao && hasVenc) ||
      (hasVerba && hasDescontos) ||
      (hasConta && hasVenc && hasDescontos);
    
    if (isHeader) {
      let vencX = findColumnX(lines[i], 'Vencimentos') || findColumnX(lines[i], 'Vencimento') || findColumnX(lines[i], 'Proventos') || findColumnX(lines[i], 'Provento');
      let descX = findColumnX(lines[i], 'Descontos') || findColumnX(lines[i], 'Desconto');
      const refX = findColumnX(lines[i], 'Refer') || findColumnX(lines[i], 'Ref') || findColumnX(lines[i], 'Qtde') || findColumnX(lines[i], 'QTDE');
      
      // If DESCONTOS not on the header line, search nearby lines (±3)
      if (descX === null) {
        for (let k = Math.max(0, i - 3); k <= Math.min(lines.length - 1, i + 3); k++) {
          if (k === i) continue;
          const nearbyDescX = findColumnX(lines[k], 'Descontos') || findColumnX(lines[k], 'Desconto');
          if (nearbyDescX !== null) {
            descX = nearbyDescX;
            break;
          }
        }
      }
      
      // If VENCIMENTOS not found, search nearby lines too
      if (vencX === null) {
        for (let k = Math.max(0, i - 3); k <= Math.min(lines.length - 1, i + 3); k++) {
          if (k === i) continue;
          const nearbyVencX = findColumnX(lines[k], 'Vencimentos') || findColumnX(lines[k], 'Vencimento') || findColumnX(lines[k], 'Proventos') || findColumnX(lines[k], 'Provento');
          if (nearbyVencX !== null) {
            vencX = nearbyVencX;
            break;
          }
        }
      }
      
      // Last resort: if we have vencX but not descX, estimate descX to the right
      if (vencX !== null && descX === null) {
        descX = vencX + 120;
      }
      
      return { headerIdx: i, vencX, descX, refX };
    }
  }
  return { headerIdx: -1, vencX: null, descX: null, refX: null };
};

/**
 * Try to parse an event line using positional items (Parser A).
 * Returns null if the line doesn't contain a valid event code item.
 */
const parseEventLineByItems = (
  line: LayoutLine,
  vencX: number,
  descX: number,
  refX: number | null,
): PayslipEvent | null => {
  // Find event code - skip date components (year preceded by "/" from Mês/Ano column)
  let eventCodeItem: TextItem | undefined;
  let mergedDescFromCode = ''; // Description merged with code in same item (e.g., "0010 Salário Base")
  for (let j = 0; j < line.items.length; j++) {
    const it = line.items[j];
    const trimmed = it.str.trim();
    
    // Exact match: standalone code item
    if (/^\d{3,4}$/.test(trimmed)) {
      // Skip if this item is a YEAR directly preceded by "/"
      let isYear = false;
      if (j >= 1 && line.items[j - 1].str.trim() === '/') {
        isYear = true;
      } else if (j >= 2 && line.items[j - 1].str.trim() === '' && line.items[j - 2].str.trim() === '/') {
        isYear = true;
      }
      if (isYear) continue;
      eventCodeItem = it;
      break;
    }
    
    // Merged match: code + description in same item (e.g., "0010 Salário Base")
    const mergedMatch = trimmed.match(/^(\d{3,4})\s+(.+)/);
    if (mergedMatch) {
      // Create a virtual TextItem for the code, but keep reference to original
      eventCodeItem = { ...it, str: mergedMatch[1] };
      mergedDescFromCode = mergedMatch[2].trim();
      // Store the original item's text to skip it later
      (eventCodeItem as any).__mergedOriginalText = trimmed;
      break;
    }
  }
  if (!eventCodeItem) return null;
  
  const codigo = eventCodeItem.str.trim();
  
  // Description: text items after code but before numeric values
  const descItems: string[] = [];
  const numericItems: TextItem[] = [];
  let passedCode = false;
  
  // Track the original merged item text to skip it in the loop
  const mergedOriginalText = mergedDescFromCode ? (eventCodeItem as any).__mergedOriginalText || '' : '';
  
  // If code was merged with description, pre-populate descItems
  if (mergedDescFromCode) {
    descItems.push(mergedDescFromCode);
    passedCode = true; // Skip past the merged item
  }
  
  for (const item of line.items) {
    if (!passedCode) {
      // For merged items, skip the item that contained code+desc
      if (mergedDescFromCode && item.str.trim().startsWith(codigo)) {
        passedCode = true;
        continue;
      }
      if (item === eventCodeItem) { passedCode = true; continue; }
      continue;
    }
    
    // Skip the original merged item (already extracted description from it)
    if (mergedOriginalText && item.str.trim() === mergedOriginalText) continue;
    
    const val = item.str.trim();
    if (!val || val === '|') continue; // Skip pipe separators
    
    if (/^[\d.,]+$/.test(val) && val.length >= 2) {
      numericItems.push(item);
    } else if (numericItems.length === 0) {
      const itemCenterX = item.x + item.width / 2;
      if (descX !== null && itemCenterX > descX + 50) continue;
      // Skip period fragments
      if (/^[\d/\s]+$/.test(val) && val.length <= 4) continue;
      // Skip dash separators
      if (/^-{2,}$/.test(val)) continue;
      descItems.push(val);
    } else {
      if (/^[\d.,]+$/.test(val)) numericItems.push(item);
    }
  }
  
  const descricao = descItems.join(' ').replace(/\s+/g, ' ').trim();
  if (!descricao) return null;
  
  // Classify numeric values by column position
  // When columns are too close (<40px), use code-based heuristic instead of position
  const columnsClose = Math.abs(vencX - descX) < 40;
  let referencia = '';
  let vencimento = '0';
  let desconto = '0';
  
  if (columnsClose) {
    // Columns unreliable - use code-based heuristic
    const isDesc = isDescontoByCode(codigo, descricao);
    if (numericItems.length === 1) {
      if (isDesc) desconto = numericItems[0].str.trim();
      else vencimento = numericItems[0].str.trim();
    } else if (numericItems.length === 2) {
      referencia = numericItems[0].str.trim();
      if (isDesc) desconto = numericItems[1].str.trim();
      else vencimento = numericItems[1].str.trim();
    } else if (numericItems.length >= 3) {
      referencia = numericItems[0].str.trim();
      vencimento = numericItems[1].str.trim();
      desconto = numericItems[2].str.trim();
    }
  } else {
    // Single-pass 3-way classification using right edge distance to all column centers
    // This prevents misclassification when QTDE/ref column is close to vencimentos
    for (const ni of numericItems) {
      const val = ni.str.trim();
      const rightEdge = ni.x + ni.width;
      
      const distVenc = Math.abs(rightEdge - vencX);
      const distDesc = Math.abs(rightEdge - descX);
      const distRef = refX !== null ? Math.abs(rightEdge - refX) : Infinity;
      
      const minDist = Math.min(distRef, distVenc, distDesc);
      
      // Use a max threshold to avoid assigning distant values
      if (minDist > 80) continue;
      
      if (minDist === distRef && distRef < 60) {
        referencia = val;
      } else if (minDist === distVenc) {
        // If venc and desc are very close, use code heuristic as tiebreaker
        if (Math.abs(distVenc - distDesc) < 15) {
          if (isDescontoByCode(codigo, descricao)) desconto = val;
          else vencimento = val;
        } else {
          vencimento = val;
        }
      } else {
        // closest to desconto
        if (Math.abs(distDesc - distVenc) < 15) {
          if (isDescontoByCode(codigo, descricao)) desconto = val;
          else vencimento = val;
        } else {
          desconto = val;
        }
      }
    }
  }
  
  return { codigo, descricao, referencia, vencimento, desconto };
};

/**
 * Fallback: parse an event line from its concatenated text (Parser B).
 * Works when PDF delivers merged text per line (e.g., "001 Horas Normais 30,00 1.531,00").
 * Pattern: code(3-4 digits) + description(text) + 1-3 monetary values at the end.
 */
const parseEventLineByTextFallback = (text: string): PayslipEvent | null => {
  // Strip pipe characters that appear in some PDF formats (ADP/Indra)
  const trimmed = text.replace(/\|/g, ' ').replace(/\s+/g, ' ').trim();
  // Match: code at start (with optional leading whitespace), then description, then monetary values at end
  const match = trimmed.match(/^(\d{3,4})\s+(.+?)(?:\s+([\d.,]+(?:\s+[\d.,]+){0,2}))\s*$/);
  if (!match) {
    // Try matching lines with only code + description + single value (no ref)
    const simpleMatch = trimmed.match(/^(\d{3,4})\s+(.+?)\s+([\d.,]+)\s*$/);
    if (!simpleMatch) return null;
    const codigo = simpleMatch[1];
    const descricao = simpleMatch[2].replace(/\s+/g, ' ').trim();
    if (/Sal[aá]rio|Base\s+FGTS|Base\s+INSS|Total|L[ií]quido|Composi[cç]|Faixa|SALÁRIO/i.test(descricao)) return null;
    const val = simpleMatch[3];
    const isDesc = isDescontoByCode(codigo, descricao);
    return { codigo, descricao, referencia: '', vencimento: isDesc ? '0' : val, desconto: isDesc ? val : '0' };
  }
  
  const codigo = match[1];
  const descricao = match[2].replace(/\s+/g, ' ').trim();
  const valuesStr = match[3];
  
  // Don't parse lines where "description" looks like footer labels
  if (/Sal[aá]rio|Base\s+FGTS|Base\s+INSS|Total|L[ií]quido|Composi[cç]|Faixa|SALÁRIO/i.test(descricao)) return null;
  
  // Extract monetary values
  const values = valuesStr.match(/[\d.,]+/g) || [];
  const isDesc = isDescontoByCode(codigo, descricao);
  
  let referencia = '';
  let vencimento = '0';
  let desconto = '0';
  
  if (values.length === 1) {
    // Single value: classify by code
    if (isDesc) desconto = values[0];
    else vencimento = values[0];
  } else if (values.length === 2) {
    // Two values: first is referência, second is venc or desc based on code
    referencia = values[0];
    if (isDesc) desconto = values[1];
    else vencimento = values[1];
  } else if (values.length >= 3) {
    referencia = values[0];
    vencimento = values[1];
    desconto = values[2];
  }
  
  return { codigo, descricao, referencia, vencimento, desconto };
};

const extractEvents = (lines: LayoutLine[]): {
  eventos: PayslipEvent[];
  totalVencimentos: string;
  totalDescontos: string;
  valorLiquido: string;
  period: string;
  headerIdx: number;
  endIdx: number;
} => {
  const eventos: PayslipEvent[] = [];
  let totalVencimentos = '';
  let totalDescontos = '';
  let valorLiquido = '';
  let period = '';
  
  // Detect table header
  const { headerIdx, vencX, descX, refX } = detectEventHeader(lines);
  
  if (headerIdx < 0) {
    return { eventos, totalVencimentos, totalDescontos, valorLiquido, period, headerIdx: -1, endIdx: -1 };
  }
  
  // Even if column X positions are missing, we can still try text fallback
  const hasPositionalInfo = vencX !== null && descX !== null;
  
  // Process lines after the header until totals/footer
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    const text = line.text;
    
    // ---- Totals detection ----
    if (/Total\s+de\s+(Vencimentos|Proventos)/i.test(text) && !totalVencimentos) {
      const v = getAlignedValue(lines, i, /Total\s+de\s+(Vencimentos|Proventos)/i);
      if (v) totalVencimentos = v;
      // Also try text fallback for totals
      if (!totalVencimentos) {
        const m = text.match(/Total\s+de\s+(?:Vencimentos|Proventos)\s+([\d.,]+)/i);
        if (m) totalVencimentos = m[1];
      }
      continue;
    }
    
    if (/Total\s+de\s+Desconto/i.test(text) && !totalDescontos) {
      const v = getAlignedValue(lines, i, /Total\s+de\s+Desconto/i);
      if (v) totalDescontos = v;
      if (!totalDescontos) {
        const m = text.match(/Total\s+de\s+Descontos?\s+([\d.,]+)/i);
        if (m) totalDescontos = m[1];
      }
      continue;
    }
    
    if (/(?:Valor\s+L[ií]quido|L[ií]quido\s+a\s+Receber|TOTAL\s+L[IÍ]QUIDO)/i.test(text) && !valorLiquido) {
      const v = getAlignedValue(lines, i, /L[ií]quido/i);
      if (v) valorLiquido = v;
      if (!valorLiquido) {
        const m = text.match(/(?:Valor\s+|TOTAL\s+)?L[ií]quido(?:\s+a\s+Receber)?\s+([\d.,]+)/i);
        if (m) valorLiquido = m[1];
      }
      // "TOTAL LIQUIDO" on this line, value on next line
      if (!valorLiquido && i + 1 < lines.length) {
        const nextVals = lines[i + 1].items.filter(it => /^[\d.,]+$/.test(it.str.trim()) && it.str.trim().includes(','));
        if (nextVals.length > 0) valorLiquido = nextVals[0].str.trim();
      }
      // Value on PREVIOUS line (e.g., "Líquido a Receber =>" appears below the value)
      if (!valorLiquido && i > 0) {
        const prevVals = lines[i - 1].items
          .filter(it => /^[\d.,]+$/.test(it.str.trim()) && it.str.trim().includes(','))
          .sort((a, b) => b.x - a.x);
        if (prevVals.length > 0) valorLiquido = prevVals[0].str.trim();
      }
      continue;
    }
    
    // ADP/Indra format: "VENCIMENTOS DESCONTOS LÍQUIDO" header followed by "T O T A I S" then values
    if (/VENCIMENTOS\s+DESCONTOS\s+L[IÍ]QUIDO/i.test(text)) {
      // Look at next lines for "T O T A I S" and values
      for (let k = i + 1; k < Math.min(i + 4, lines.length); k++) {
        const kText = lines[k].text;
        // Line with numeric values (totals)
        const totalsValues = lines[k].items
          .filter(it => /^[\d.,]+$/.test(it.str.trim()) && it.str.trim().includes(','))
          .sort((a, b) => a.x - b.x);
        if (totalsValues.length >= 2 && !/T\s*O\s*T\s*A\s*I\s*S/i.test(kText)) {
          if (!totalVencimentos && totalsValues[0]) totalVencimentos = totalsValues[0].str.trim();
          if (!totalDescontos && totalsValues[1]) totalDescontos = totalsValues[1].str.trim();
          if (!valorLiquido && totalsValues[2]) valorLiquido = totalsValues[2].str.trim();
          break;
        }
      }
      break; // Stop processing events
    }
    
    // Stop at footer/resume labels — but first capture totals if on the same line
    if (/Sal[aá]rio\s+(Base|Fixo)/i.test(text) && !/Evento|Discrimina|Descri/i.test(text) && !/^\s*\d{3,4}\s/.test(text)) break;
    if (/Sal\.\s*Contr/i.test(text)) break;
    if (/SAL[AÁ]RIO\s+CONTR/i.test(text)) break;
    if (/Base\s+(?:para\s+|C[aá]lc\.?\s*)?FGTS/i.test(text)) {
      // Before breaking, capture totals that may be on the same line (MENTOR format)
      if (/Total\s+de\s+(Vencimentos|Proventos)/i.test(text) && !totalVencimentos) {
        // Get values from next line, matched by X position to label
        if (i + 1 < lines.length) {
          const labelX = findLabelXInItems(line.items, /Total\s+de\s+(Proventos|Vencimentos)/i);
          if (labelX >= 0) {
            const nextVals = lines[i + 1].items
              .filter(it => /^[\d.,]+$/.test(it.str.trim()) && it.str.trim().includes(','))
              .sort((a, b) => Math.abs(a.x - labelX) - Math.abs(b.x - labelX));
            if (nextVals.length > 0 && Math.abs(nextVals[0].x - labelX) < 250) {
              totalVencimentos = nextVals[0].str.trim();
            }
          }
        }
      }
      break;
    }
    if (/Composi[cç][aã]o\s+do\s+Sal[aá]rio/i.test(text)) break;
    if (/Local\s+do\s+Pagamento/i.test(text)) break;
    if (/Assinado\s+eletronicamente/i.test(text)) break;
    if (/Fls\.?\s*:/i.test(text)) break;
    if (/^Resumo$/i.test(text.trim())) break;
    if (/Processado\s+pela/i.test(text)) break;
    // Stop at BASE/OUTROS separator (items after are footer/base data, not events)
    if (/BASE\s*\/\s*OUTROS/i.test(text)) break;
    if (/^-{4,}\s*-{4,}/.test(text.trim())) continue; // Skip pure dash separator lines
    
    // Try to extract period from "Mês/Ano" column (e.g. "8 / 2020" or "03 / 2019")
    if (!period) {
      const periodMatch = text.match(/(\d{1,2})\s*\/\s*(\d{4})/);
      if (periodMatch) {
        const m = periodMatch[1].padStart(2, '0');
        period = `${m}/${periodMatch[2]}`;
      }
    }
    
    // Try Parser A (positional) first
    let event: PayslipEvent | null = null;
    if (hasPositionalInfo) {
      event = parseEventLineByItems(line, vencX!, descX!, refX);
    }
    
    // If Parser A failed, try Parser B (text fallback)
    if (!event) {
      event = parseEventLineByTextFallback(text);
    }
    
    if (event) {
      eventos.push(event);
    }
  }
  
  // Find last event-related line index
  let lastEventIdx = headerIdx;
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const t = lines[i].text;
    if (/Sal[aá]rio\s+(Base|Fixo)/i.test(t) || /Sal\.\s*Contr/i.test(t) || /Base\s+para\s+FGTS/i.test(t) || /Composi[cç][aã]o\s+do\s+Sal[aá]rio/i.test(t) || /Local\s+do\s+Pagamento/i.test(t)) break;
    if (/(?:Valor\s+L[ií]quido|L[ií]quido\s+a\s+Receber)/i.test(t)) { lastEventIdx = i; break; }
    if (/Total\s+de\s+(Vencimentos|Proventos|Desconto)/i.test(t)) lastEventIdx = i;
  }
  
  return { eventos, totalVencimentos, totalDescontos, valorLiquido, period, headerIdx, endIdx: lastEventIdx };
};

const extractFooter = (lines: LayoutLine[]): {
  salarioBase: string; salarioContrInss: string; faixaIrrf: string;
  baseInss: string; baseFgts: string;
  fgtsMes: string; baseIrrf: string; irrf: string;
  totalVencimentos: string; totalDescontos: string; valorLiquido: string;
} => {
  const result = {
    salarioBase: '', salarioContrInss: '', faixaIrrf: '',
    baseInss: '', baseFgts: '', fgtsMes: '', baseIrrf: '', irrf: '',
    totalVencimentos: '', totalDescontos: '', valorLiquido: '',
  };
  
  // Helper: extract all label-value pairs from footer by scanning label lines and value lines
  // Footer pattern: labels on one line, values on the next line (aligned by X position)
  for (let i = 0; i < lines.length; i++) {
    const text = lines[i].text;
    const items = lines[i].items;
    
    // Style A: Keypar-style footer with labels on one row and values below
    // Row 1: "SALÁRIO BASE --- SALÁRIO CONTR. INSS --- FAIXA IRRF --- TOTAL DE VENCIMENTOS --- TOTAL DE DESCONTOS"
    // Row 2: values
    // Row 3: "BASE CÁLC. FGTS --- FGTS DO MÊS --- BASE CALCULO IRRF --- VALOR LÍQUIDO"
    // Row 4: values
    
    if (/Sal[aá]rio\s+Base/i.test(text) && (/Sal[aá]rio\s+Contr/i.test(text) || /Sal\.\s*Contr/i.test(text) || /Total\s+de\s+Vencimentos/i.test(text) || /Faixa\s+IRRF/i.test(text))) {
      // Multi-label footer row - map labels to X positions
      const labelPositions: { label: string; x: number }[] = [];
      
      // Scan items to find labels and their positions
      const footerLabels = [
        { regex: /Sal[aá]rio\s+Base/i, name: 'salarioBase' },
        { regex: /Sal[aá]rio\s+Contr\.?\s*INSS|Sal\.\s*Contr\.?\s*INSS/i, name: 'salarioContrInss' },
        { regex: /Faixa\s+IRRF/i, name: 'faixaIrrf' },
        { regex: /Total\s+de\s+(Vencimentos|Proventos)/i, name: 'totalVencimentos' },
        { regex: /Total\s+de\s+Descontos?/i, name: 'totalDescontos' },
      ];
      
      for (const fl of footerLabels) {
        const x = findLabelXInItems(items, fl.regex);
        if (x >= 0) labelPositions.push({ label: fl.name, x });
      }
      
      // Get values from same line or next line
      const valueItems = items
        .filter(it => /^[\d.,]+$/.test(it.str.trim()) && it.str.trim().includes(','))
        .sort((a, b) => a.x - b.x);
      
      const nextLineValues = (i + 1 < lines.length) ? lines[i + 1].items
        .filter(it => /^[\d.,]+$/.test(it.str.trim()) && it.str.trim().length > 1)
        .sort((a, b) => a.x - b.x) : [];
      
      const allValues = valueItems.length > 0 ? valueItems : nextLineValues;
      
      // Match values to labels by closest X
      for (const lp of labelPositions) {
        let closestVal = '';
        let closestDist = Infinity;
        for (const v of allValues) {
          const dist = Math.abs(v.x - lp.x);
          if (dist < closestDist && dist < 250) {
            closestDist = dist;
            closestVal = v.str.trim();
          }
        }
        if (closestVal) {
          (result as any)[lp.label] = closestVal;
        }
      }
      continue;
    }
    
    // Second footer row: BASE CÁLC. FGTS, FGTS DO MÊS, BASE CALCULO IRRF, VALOR LÍQUIDO
    // Also matches: "Base para FGTS FGTS do mês Total de Proventos" (MENTOR format)
    if (/Base\s+(?:para\s+|C[aá]lc?\.?\s*)?FGTS/i.test(text) || (/FGTS\s+do\s+M[eê]s/i.test(text) && /Base\s+C[aá]l(?:c\.?|culo?)?\s*IRRF/i.test(text))) {
      const labelPositions2: { label: string; x: number }[] = [];
      const footerLabels2 = [
        { regex: /Base\s+(?:para\s+|C[aá]lc?\.?\s*)?FGTS/i, name: 'baseFgts' },
        { regex: /FGTS\s+do\s+M[eê]s/i, name: 'fgtsMes' },
        { regex: /Base\s+C[aá]l(?:c\.?|culo?)?\s*IRRF/i, name: 'baseIrrf' },
        { regex: /(?:Valor\s+)?L[ií]quido(?:\s+a\s+Receber)?/i, name: 'valorLiquido' },
        { regex: /Total\s+de\s+(Proventos|Vencimentos)/i, name: 'totalVencimentos' },
        { regex: /Total\s+de\s+Descontos?/i, name: 'totalDescontos' },
      ];
      
      for (const fl of footerLabels2) {
        const x = findLabelXInItems(items, fl.regex);
        if (x >= 0) labelPositions2.push({ label: fl.name, x });
      }
      
      const valueItems2 = items
        .filter(it => /^[\d.,]+$/.test(it.str.trim()) && it.str.trim().includes(','))
        .sort((a, b) => a.x - b.x);
      
      const nextLineValues2 = (i + 1 < lines.length) ? lines[i + 1].items
        .filter(it => /^[\d.,]+$/.test(it.str.trim()) && it.str.trim().length > 1)
        .sort((a, b) => a.x - b.x) : [];
      
      const allValues2 = valueItems2.length > 0 ? valueItems2 : nextLineValues2;
      
      for (const lp of labelPositions2) {
        let closestVal = '';
        let closestDist = Infinity;
        for (const v of allValues2) {
          const dist = Math.abs(v.x - lp.x);
          if (dist < closestDist && dist < 250) {
            closestDist = dist;
            closestVal = v.str.trim();
          }
        }
        if (closestVal) {
          (result as any)[lp.label] = closestVal;
        }
      }
      continue;
    }
    
    // MENTOR format: "Base Cál IRRF  Pensão Alim. Extra Folha  Total de Desconto" (multi-label row)
    if (/Base\s+C[aá]l.*IRRF/i.test(text) && /Total\s+de\s+Desconto/i.test(text)) {
      const labelPositions3: { label: string; x: number }[] = [];
      const footerLabels3 = [
        { regex: /Base\s+C[aá]l(?:c\.?|culo?)?\s*IRRF/i, name: 'baseIrrf' },
        { regex: /Pens[aã]o\s+Alim/i, name: '_pensaoAlim' },
        { regex: /Total\s+de\s+Descontos?/i, name: 'totalDescontos' },
      ];
      
      for (const fl of footerLabels3) {
        const x = findLabelXInItems(items, fl.regex);
        if (x >= 0) labelPositions3.push({ label: fl.name, x });
      }
      
      const valueItems3 = items
        .filter(it => /^[\d.,]+$/.test(it.str.trim()) && it.str.trim().includes(','))
        .sort((a, b) => a.x - b.x);
      
      const nextLineValues3 = (i + 1 < lines.length) ? lines[i + 1].items
        .filter(it => /^[\d.,]+$/.test(it.str.trim()) && it.str.trim().length > 1)
        .sort((a, b) => a.x - b.x) : [];
      
      const allValues3 = valueItems3.length > 0 ? valueItems3 : nextLineValues3;
      
      for (const lp of labelPositions3) {
        if (lp.label.startsWith('_')) continue; // skip internal labels
        let closestVal = '';
        let closestDist = Infinity;
        for (const v of allValues3) {
          const dist = Math.abs(v.x - lp.x);
          if (dist < closestDist && dist < 250) {
            closestDist = dist;
            closestVal = v.str.trim();
          }
        }
        if (closestVal) {
          (result as any)[lp.label] = closestVal;
        }
      }
      continue;
    }
    
    // Style B: Old-style compact single line (Salário Base + Sal.Contr in one line)
    if (/Sal[aá]rio\s+Base/i.test(text) && /Sal\.\s*Contr/i.test(text) && !result.salarioBase) {
      const values = items
        .filter(it => /^[\d.,]+$/.test(it.str.trim()) && it.str.trim().includes(','))
        .sort((a, b) => a.x - b.x);
      const vals = values.length > 0 ? values : (
        i + 1 < lines.length ? lines[i + 1].items
          .filter(it => /^[\d.,]+$/.test(it.str.trim()) && it.str.trim().includes(','))
          .sort((a, b) => a.x - b.x) : []
      );
      if (vals.length >= 1) result.salarioBase = vals[0].str.trim();
      if (vals.length >= 2) result.salarioContrInss = vals[1].str.trim();
      if (vals.length >= 3) result.baseFgts = vals[2].str.trim();
      if (vals.length >= 4) result.fgtsMes = vals[3].str.trim();
      if (vals.length >= 5) result.baseIrrf = vals[4].str.trim();
      if (vals.length >= 6) result.irrf = vals[5].str.trim();
      continue;
    }
    
    // Style C: individual/grouped labels with positional value matching
    // Also handles Keypar-style where each label is on its own line with value on next line
    if (/Sal[aá]rio\s+(Base|Fixo)/i.test(text) && !result.salarioBase) {
      result.salarioBase = getAlignedValue(lines, i, /Sal[aá]rio\s*(Base|Fixo)/i);
      if (!result.salarioBase) {
        // Try next line for just a numeric value
        if (i + 1 < lines.length) {
          const nextVals = lines[i + 1].items.filter(it => /^[\d.,]+$/.test(it.str.trim()) && it.str.trim().includes(','));
          if (nextVals.length > 0) result.salarioBase = nextVals[0].str.trim();
        }
      }
    }
    if (/Composi[cç][aã]o\s+do\s+Sal[aá]rio/i.test(text) && !result.salarioBase) {
      for (let k = i + 1; k < Math.min(i + 4, lines.length); k++) {
        if (/Sal[aá]rio\s+Fixo/i.test(lines[k].text)) {
          result.salarioBase = getAlignedValue(lines, k, /Sal[aá]rio/i);
          // Also try: "Salário Fixo" label with numeric value on same line
          if (!result.salarioBase) {
            const fixoVals = lines[k].items.filter(it => /^[\d.,]+$/.test(it.str.trim()) && it.str.trim().includes(','));
            if (fixoVals.length > 0) result.salarioBase = fixoVals[0].str.trim();
          }
          break;
        }
      }
    }
    if (/Base\s+(?:para\s+|C[aá]lc?\.?\s*)?FGTS/i.test(text) && !result.baseFgts) {
      result.baseFgts = getAlignedValue(lines, i, /Base/i);
      if (!result.baseFgts && i + 1 < lines.length) {
        const nextVals = lines[i + 1].items.filter(it => /^[\d.,]+$/.test(it.str.trim()) && it.str.trim().includes(','));
        if (nextVals.length > 0) result.baseFgts = nextVals[0].str.trim();
      }
    }
    if (/FGTS\s+(?:do\s+)?m[eê]s/i.test(text) && !result.fgtsMes) {
      result.fgtsMes = getAlignedValue(lines, i, /FGTS/i);
      if (!result.fgtsMes && i + 1 < lines.length) {
        const nextVals = lines[i + 1].items.filter(it => /^[\d.,]+$/.test(it.str.trim()) && it.str.trim().includes(','));
        if (nextVals.length > 0) result.fgtsMes = nextVals[0].str.trim();
      }
    }
    if (/Base\s+(?:C[aá]l\.?\s*|C[aá]lculo?\s*|para\s+)?IRRF/i.test(text) && !result.baseIrrf) {
      result.baseIrrf = getAlignedValue(lines, i, /Base.*IRRF/i);
      if (!result.baseIrrf) result.baseIrrf = getAlignedValue(lines, i, /^Base/i);
      if (!result.baseIrrf && i + 1 < lines.length) {
        const nextVals = lines[i + 1].items.filter(it => /^[\d.,]+$/.test(it.str.trim()) && it.str.trim().includes(','));
        if (nextVals.length > 0) result.baseIrrf = nextVals[0].str.trim();
      }
    }
    if ((/Sal[aá]rio\s+Contr\.?\s*INSS/i.test(text) || /Sal\.?\s*Cont?\.?\s*INSS/i.test(text)) && !result.salarioContrInss) {
      result.salarioContrInss = getAlignedValue(lines, i, /^Sal/i);
      if (!result.salarioContrInss && i + 1 < lines.length) {
        const nextVals = lines[i + 1].items.filter(it => /^[\d.,]+$/.test(it.str.trim()) && it.str.trim().includes(','));
        if (nextVals.length > 0) result.salarioContrInss = nextVals[0].str.trim();
      }
    }
    if (/Base\s+INSS/i.test(text) && !result.baseInss) {
      result.baseInss = getAlignedValue(lines, i, /Base.*INSS/i);
    }
    if (/Faixa\s+IRRF/i.test(text) && !result.faixaIrrf) {
      result.faixaIrrf = getAlignedValue(lines, i, /Faixa/i);
      if (!result.faixaIrrf && i + 1 < lines.length) {
        const nextVals = lines[i + 1].items.filter(it => /^[\d.,]+$/.test(it.str.trim()) && it.str.trim().includes(','));
        if (nextVals.length > 0) result.faixaIrrf = nextVals[0].str.trim();
      }
    }
    if (/Total\s+de\s+(Vencimentos|Proventos)/i.test(text) && !result.totalVencimentos) {
      result.totalVencimentos = getAlignedValue(lines, i, /Total\s+de\s+(Vencimentos|Proventos)/i);
      if (!result.totalVencimentos && i + 1 < lines.length) {
        const nextVals = lines[i + 1].items.filter(it => /^[\d.,]+$/.test(it.str.trim()) && it.str.trim().includes(','));
        if (nextVals.length > 0) result.totalVencimentos = nextVals[0].str.trim();
      }
    }
    if (/Total\s+de\s+Descontos?/i.test(text) && !result.totalDescontos) {
      result.totalDescontos = getAlignedValue(lines, i, /Total\s+de\s+Descontos?/i);
      if (!result.totalDescontos && i + 1 < lines.length) {
        const nextVals = lines[i + 1].items.filter(it => /^[\d.,]+$/.test(it.str.trim()) && it.str.trim().includes(','));
        if (nextVals.length > 0) result.totalDescontos = nextVals[0].str.trim();
      }
    }
    if (/(?:Valor\s+L[ií]quido|L[ií]quido\s+a\s+Receber|TOTAL\s+L[IÍ]QUIDO)/i.test(text) && !result.valorLiquido) {
      result.valorLiquido = getAlignedValue(lines, i, /L[ií]quido/i);
      if (!result.valorLiquido && i + 1 < lines.length) {
        const nextVals = lines[i + 1].items.filter(it => /^[\d.,]+$/.test(it.str.trim()) && it.str.trim().includes(','));
        if (nextVals.length > 0) result.valorLiquido = nextVals[0].str.trim();
      }
      // Try standalone number on same line (skip "=>" arrows)
      if (!result.valorLiquido) {
        const m = text.replace(/=>/g, '').match(/L[ií]quido(?:\s+a\s+Receber)?[:\s]*([\d.,]+)/i);
        if (m) result.valorLiquido = m[1];
      }
      // Try: line has "Líquido a Receber =>" then value items after arrow
      if (!result.valorLiquido) {
        const arrowIdx = items.findIndex(it => it.str.trim() === '=>');
        if (arrowIdx >= 0) {
          for (let k = arrowIdx + 1; k < items.length; k++) {
            const val = items[k].str.trim();
            if (/^[\d.,]+$/.test(val) && val.includes(',')) {
              result.valorLiquido = val;
              break;
            }
          }
        }
      }
      // Try PREVIOUS line: value appears above the "Líquido a Receber =>" label
      if (!result.valorLiquido && i > 0) {
        const prevVals = lines[i - 1].items
          .filter(it => /^[\d.,]+$/.test(it.str.trim()) && it.str.trim().includes(','))
          .sort((a, b) => b.x - a.x); // rightmost value first
        if (prevVals.length > 0) result.valorLiquido = prevVals[0].str.trim();
      }
    }
  }
  
  return result;
};

const extractBankInfo = (lines: LayoutLine[]): { banco: string; agencia: string; contaCorrente: string } => {
  const result = { banco: '', agencia: '', contaCorrente: '' };
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const text = line.text;
    const items = line.items;
    
    // Strategy 1: Labels on one line, values on same line after label (e.g. "Banco  033  Agência  82  C/C  00071...")
    // or labels on one line and values on next line
    const hasBancoLabel = items.some(it => /^(Banco|BCO)$/i.test(it.str.trim()));
    const hasAgLabel = items.some(it => /^(Ag[eê]ncia|AG)$/i.test(it.str.trim()));
    const hasCCLabel = items.some(it => /^(C\/C|Conta|CONTA)$/i.test(it.str.trim()));
    
    if (hasBancoLabel || hasAgLabel || hasCCLabel) {
      // Collect label-value pairs from items on this line
      for (let j = 0; j < items.length; j++) {
        const label = items[j].str.trim();
        
        if (/^(Banco|BCO)$/i.test(label) && !result.banco) {
          // Next item on same line is value
          if (j + 1 < items.length) {
            const nextVal = items[j + 1].str.trim();
            if (nextVal && !/^(Ag[eê]ncia|AG|C\/C|Conta|CONTA|Local)$/i.test(nextVal)) {
              result.banco = nextVal;
            }
          }
        }
        if (/^(Ag[eê]ncia|AG)$/i.test(label) && !result.agencia) {
          if (j + 1 < items.length) {
            const nextVal = items[j + 1].str.trim();
            if (nextVal && !/^(C\/C|Conta|CONTA|Banco|BCO)$/i.test(nextVal) && /[\d]/.test(nextVal)) {
              result.agencia = nextVal;
            }
          }
        }
        if (/^(C\/C|Conta|CONTA)$/i.test(label) && !result.contaCorrente) {
          if (j + 1 < items.length) {
            const nextVal = items[j + 1].str.trim();
            if (nextVal && /[\d]/.test(nextVal)) {
              result.contaCorrente = nextVal;
            }
          }
        }
      }
      
      // Fallback: values on next line at similar X positions
      if ((!result.banco || !result.agencia || !result.contaCorrente) && i + 1 < lines.length) {
        const nextItems = lines[i + 1].items.sort((a, b) => a.x - b.x);
        for (let j = 0; j < items.length; j++) {
          const label = items[j].str.trim();
          const labelX = items[j].x;
          
          if (/^(Banco|BCO)$/i.test(label) && !result.banco) {
            for (const ni of nextItems) {
              if (Math.abs(ni.x - labelX) < 100 && ni.str.trim().length > 0) {
                result.banco = ni.str.trim();
                break;
              }
            }
          }
          if (/^(Ag[eê]ncia|AG)$/i.test(label) && !result.agencia) {
            for (const ni of nextItems) {
              if (Math.abs(ni.x - labelX) < 100 && /[\d-]+/.test(ni.str.trim())) {
                result.agencia = ni.str.trim();
                break;
              }
            }
          }
          if (/^(C\/C|Conta|CONTA)$/i.test(label) && !result.contaCorrente) {
            for (const ni of nextItems) {
              if (Math.abs(ni.x - labelX) < 100 && /[\d.-]+/.test(ni.str.trim())) {
                result.contaCorrente = ni.str.trim();
                break;
              }
            }
          }
        }
      }
    }
    
    // Strategy 2: Inline regex (e.g. "Banco: 033  Agência: 82  C/C: 00071...")
    if (!result.banco) {
      const bankMatch = text.match(/(?:Banco|BCO)[:\s]+([\d]+)/i);
      if (bankMatch) result.banco = bankMatch[1].trim();
    }
    if (!result.agencia) {
      const agMatch = text.match(/Ag[eê]ncia[:\s]*([\d-]+)/i);
      if (agMatch) result.agencia = agMatch[1].trim();
    }
    if (!result.contaCorrente) {
      const contaMatch = text.match(/(?:Conta\s*(?:Corrente)?|C\/C)[:\s]*([\d.-]+)/i);
      if (contaMatch) result.contaCorrente = contaMatch[1].trim();
    }
    
    // Strategy 3: Bank name detection
    if (!result.banco) {
      const bankMatch = text.match(/(Ita[uú]\s*(?:Unibanco)?|Bradesco|Santander|Caixa|Banco\s+do\s+Brasil|BB|Sicoob|Sicredi|Nu[Bb]ank|Inter|C6)/i);
      if (bankMatch) result.banco = bankMatch[1].trim();
    }
    
    // Strategy 4: "DEPÓSITO EFETUADO NA CONTA CORRENTE: XXXXX" format
    if (!result.contaCorrente) {
      const depositoMatch = text.match(/DEP[OÓ]SITO\s+EFETUADO\s+NA\s+CONTA\s+CORRENTE[:\s]*([\d]+)/i);
      if (depositoMatch) result.contaCorrente = depositoMatch[1].trim();
    }
    
    // Strategy 5: "BANCO: BANCO DO BRASIL" format (full name after label)
    if (!result.banco) {
      const bankNameMatch = text.match(/BANCO[:\s]+([A-ZÀ-Ú][A-ZÀ-Ú\s.]+)/i);
      if (bankNameMatch) {
        const bankName = bankNameMatch[1].trim();
        if (bankName.length > 3 && !/^DEPOSIT/i.test(bankName)) {
          result.banco = bankName;
        }
      }
    }
    
    if (result.banco && result.agencia && result.contaCorrente) break;
  }
  
  return result;
};

// ======== Universal label-value scanner ========

/**
 * Words that are purely structural column headers or decorative text.
 * These should NEVER be treated as labels.
 */
const STRUCTURAL_WORDS = new Set([
  'discriminação', 'discriminacao', 'das', 'parcelas', 'demonstrativo', 'de', 'pagamento', 'mensal',
  'composição', 'composicao', 'do', 'salário', 'salario', 'mês', 'mes', 'ano', 'evento',
  'ref', 'proventos', 'descontos', 'vencimentos', 'código', 'codigo', 'descrição', 'descricao',
  'a', 'transportar', 'declaro', 'ter', 'recebido', 'importância', 'importancia', 'líquida', 'liquida',
  'discriminada', 'neste', 'recibo', 'assinatura', 'funcionário', 'funcionario', 'data',
]);

const isStructuralLine = (text: string): boolean => {
  if (/Documento\s+assinado/i.test(text)) return true;
  if (/^Fls\.?:/i.test(text.trim())) return true;
  if (/^https?:/i.test(text.trim())) return true;
  if (/N[uú]mero\s+do\s+(processo|documento)/i.test(text)) return true;
  if (/Declaro\s+ter\s+recebido/i.test(text)) return true;
  if (/Assinatura\s+do\s+Funcion/i.test(text)) return true;
  if (/____/i.test(text)) return true;
  if (/^\*{3,}/.test(text.trim())) return true;
  if (/^=>$/.test(text.trim())) return true;
  return false;
};

/** Check if text is a formatted numeric value (e.g., "2.420,16", "0,00", "8,25") */
const isFormattedNumber = (s: string): boolean => {
  const t = s.trim();
  if (!t) return false;
  return /^\d[\d.,]*$/.test(t) && t.length >= 1;
};

/** Check if text is a date value */
const isDateValue = (s: string): boolean => /^\d{2}\/\d{2}\/\d{4}$/.test(s.trim());

/** Check if text looks like a data value (number, date, or short code) */
const isDataValue = (s: string): boolean => {
  const t = s.trim();
  if (!t) return false;
  if (isFormattedNumber(t)) return true;
  if (isDateValue(t)) return true;
  // CNPJ pattern
  if (/^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/.test(t)) return true;
  // CPF pattern
  if (/^\d{3}\.\d{3}\.\d{3}-\d{2}$/.test(t)) return true;
  // CEP pattern
  if (/^\d{5}-?\d{3}$/.test(t)) return true;
  return false;
};

/**
 * Check if an item text is purely structural (column header word that should be skipped).
 */
const isStructuralWord = (s: string): boolean => {
  const words = s.trim().toLowerCase().split(/\s+/);
  // If ALL words are structural, it's structural
  return words.length > 0 && words.every(w => STRUCTURAL_WORDS.has(w));
};

/**
 * Scan ALL lines (outside of the events table) and extract every
 * label → value pair found. This is completely generic and does not
 * rely on a predefined list of labels.
 * 
 * Strategy:
 * 1. Colon-separated pairs: "Label: Value"
 * 2. Text → Number pairs: accumulate text items, emit when a numeric value follows
 * 3. Known label → text value pairs (for non-numeric values like names)
 */
const extractAllFields = (
  lines: LayoutLine[],
  eventsStartIdx: number,
  eventsEndIdx: number,
): ExtractedField[] => {
  const fields: ExtractedField[] = [];
  const seen = new Set<string>();

  const add = (key: string, value: string) => {
    let k = key.trim();
    let v = value.trim();
    if (!k || !v || k.length < 2) return;
    // Skip pure numbers as keys
    if (/^[\d.,]+$/.test(k)) return;
    // Skip structural/decorative text
    if (isStructuralWord(k)) return;
    if (/^(=>|A\s+TRANSPORTAR|Fls|____)/i.test(k)) return;
    // Clean up trailing colons/special chars from key
    k = k.replace(/[:=]+$/, '').trim();
    if (!k) return;
    const uid = `${k.toLowerCase()}::${v}`;
    if (seen.has(uid)) return;
    seen.add(uid);
    fields.push({ key: k, value: v });
  };

  /** Known labels that can have TEXT values (not just numbers) */
  const TEXT_VALUE_LABELS = [
    /^Empresa$/i, /^Raz[aã]o\s+Social$/i, /^Nome$/i, /^Nome\s+do\s+Funcion[aá]rio$/i,
    /^Matr[ií]cula$/i, /^Mat\.?$/i, /^Registro$/i, /^Cadastro$/i,
    /^Fun[cç][aã]o$/i, /^Cargo$/i, /^Cargo\s*\/\s*N[ií]vel$/i, /^N[ií]vel$/i, /^Bairro$/i, /^Cidade$/i, /^UF$/i,
    /^Endere[cç]o$/i, /^Departamento$/i, /^Se[cç][aã]o$/i, /^Lota[cç][aã]o$/i,
    /^Local\s+do\s+Pagamento$/i, /^Local$/i, /^Folha$/i, /^Tipo\s+Folha$/i, /^Filial$/i,
    /^Banco$/i, /^Banco\s+Deposit[aá]rio$/i, /^CC$/i, /^Centro\s+(?:de\s+)?Custo$/i,
    /^Dep\.?\s*IR$/i, /^Dep\.?\s*SF$/i, /^Dep\.?\s*IRRF$/i, /^Dep\.?\s*Sal\.?\s*Fam[ií]lia$/i,
    /^CTPS$/i, /^Hor[aá]rio$/i, /^Sequ[eê]ncia$/i, /^Refer[eê]ncia$/i,
    /^Trabalhador$/i, /^Mensagem$/i, /^Conta$/i, /^D[ií]gito$/i,
    /^CBO$/i, /^M[eêÊ]S\s*\/?\s*ANO$/i, /^M[eêÊ]SANO$/i, /^Data\s*Admiss[aã]o$/i,
    /^Data\s+de\s+Admiss[aã]o$/i,
  ];

  const isTextValueLabel = (s: string): boolean => {
    const t = s.trim();
    return TEXT_VALUE_LABELS.some(p => p.test(t));
  };

  /**
   * Check if a line is a "label row" — contains mostly known labels with no interleaved values.
   * Returns the detected labels with their X positions.
   */
  const detectLabelRow = (line: LayoutLine): { label: string; x: number; rightEdge: number }[] => {
    const labels: { label: string; x: number; rightEdge: number }[] = [];
    const lineItems = line.items;
    
    for (let j = 0; j < lineItems.length; j++) {
      const str = lineItems[j].str.trim();
      if (!str) continue;
      
      // Try single item
      if (isTextValueLabel(str) || KNOWN_LABELS.test(str)) {
        labels.push({ label: str, x: lineItems[j].x, rightEdge: lineItems[j].x + lineItems[j].width });
        continue;
      }
      
      // Try multi-word combinations (2-4 items)
      let found = false;
      for (let len = 2; len <= Math.min(4, lineItems.length - j); len++) {
        const combined = lineItems.slice(j, j + len).map(it => it.str.trim()).filter(Boolean).join(' ');
        if (isTextValueLabel(combined)) {
          const lastItem = lineItems[j + len - 1];
          labels.push({ label: combined, x: lineItems[j].x, rightEdge: lastItem.x + lastItem.width });
          j += len - 1; // skip consumed items
          found = true;
          break;
        }
      }
      if (found) continue;
      
      // If it's a pure value (number/date) interleaved, this is NOT a pure label row
      if (isDataValue(str)) {
        // Allow one or two data values mixed in (e.g., "MÊSANO 11 / 2024" where 11 is a value)
        continue;
      }
    }
    
    return labels;
  };

  for (let i = 0; i < lines.length; i++) {
    // Skip event table lines
    if (eventsStartIdx >= 0 && i >= eventsStartIdx && i <= eventsEndIdx) continue;
    // Skip structural lines
    if (isStructuralLine(lines[i].text)) continue;

    const items = lines[i].items;
    
    // ---- Phase 1: Colon-separated pairs ----
    // Process "Label: Value" patterns first (high confidence)
    let j = 0;
    while (j < items.length) {
      const str = items[j].str.trim();

      if (str.endsWith(':') && str.length > 1) {
        const label = str.replace(/:$/, '').trim();
        const valParts: string[] = [];
        let k = j + 1;
        while (k < items.length) {
          const next = items[k].str.trim();
          if (!next) { k++; continue; }
          // Stop at next colon-label
          if (next.endsWith(':') && next.length > 1) break;
          valParts.push(next);
          k++;
          // For most labels, 3-4 value parts is enough
          if (valParts.length >= 5) break;
        }
        if (valParts.length > 0) add(label, valParts.join(' '));
        j = k;
        continue;
      }
      j++;
    }

    // ---- Phase 2: Text → Number/Date value pairs (generic) ----
    // Accumulate non-numeric text items; when a number/date follows, treat text as label
    let labelAccum: string[] = [];
    let labelStartJ = 0;
    
    for (let jj = 0; jj < items.length; jj++) {
      const str = items[jj].str.trim();
      if (!str) continue;
      
      // Skip items already captured by colon phase
      if (str.endsWith(':') && str.length > 1) {
        labelAccum = [];
        // Skip to after the colon-value pair
        let skip = jj + 1;
        while (skip < items.length) {
          const next = items[skip].str.trim();
          if (!next) { skip++; continue; }
          if (next.endsWith(':') && next.length > 1) break;
          if (isDataValue(next)) { skip++; break; }
          skip++;
          break;
        }
        jj = skip - 1;
        continue;
      }
      
      if (isDataValue(str)) {
        // We hit a value - if we accumulated label text, pair them
        if (labelAccum.length > 0) {
          const label = labelAccum.join(' ');
          if (!isStructuralWord(label) && label.length >= 2) {
            add(label, str);
          }
        }
        labelAccum = [];
      } else {
        // Text item - accumulate as potential label
        if (labelAccum.length === 0) labelStartJ = jj;
        // Don't accumulate too many words (likely not a single label)
        if (labelAccum.length >= 6) {
          labelAccum = [str];
          labelStartJ = jj;
        } else {
          labelAccum.push(str);
        }
      }
    }
    
    // ---- Phase 3: Known text-value labels ----
    // For labels whose values are text (not numbers), use known patterns
    for (let jj = 0; jj < items.length; jj++) {
      const str = items[jj].str.trim();
      
      // Try multi-word text-value label (e.g., "Nome do Funcionário")
      let matchedLabel = '';
      let labelEndIdx = jj;
      
      if (isTextValueLabel(str)) {
        matchedLabel = str;
        labelEndIdx = jj;
      } else {
        // Try 2-3 word combinations
        for (let len = 2; len <= Math.min(4, items.length - jj); len++) {
          const combined = items.slice(jj, jj + len).map(it => it.str.trim()).filter(Boolean).join(' ');
          if (isTextValueLabel(combined)) {
            matchedLabel = combined;
            labelEndIdx = jj + len - 1;
            break;
          }
        }
      }
      
      if (matchedLabel) {
        const valParts: string[] = [];
        let k = labelEndIdx + 1;
        while (k < items.length) {
          const next = items[k].str.trim();
          if (!next) { k++; continue; }
          // Stop at structural words or other known labels
          if (isTextValueLabel(next)) break;
          if (next.endsWith(':') && next.length > 1) break;
          // Stop at labels that commonly follow (CBO, Departamento, etc.)
          if (/^(CBO|Departamento|Filial|Matr|Admiss|Data|Cargo|Fun[cç]|Endere|Bairro|Cidade|CEP|UF|PIS|CPF|CNPJ|Empresa|Banco|Ag[eê]ncia|C\/C|Conta|Sal[aá]rio|Base|Total|L[ií]quido|Folha|Ref|Proventos|Descontos|Vencimentos|Evento|Discrimina|M[eê]s|IR$)/i.test(next)) break;
          valParts.push(next);
          k++;
          if (valParts.length >= 5) break;
        }
        if (valParts.length > 0) {
          add(matchedLabel, valParts.join(' '));
        }
      }
    }
    
    // ---- Phase 4: Vertical label-value matching ----
    // If this line contains multiple known labels with no values on the same line,
    // look at the NEXT line and match items by X position.
    const detectedLabels = detectLabelRow(lines[i]);
    if (detectedLabels.length >= 2) {
      const nextIdx = i + 1;
      if (nextIdx < lines.length && 
          !(eventsStartIdx >= 0 && nextIdx >= eventsStartIdx && nextIdx <= eventsEndIdx) &&
          !isStructuralLine(lines[nextIdx].text)) {
        const nextItems = lines[nextIdx].items;
        
        for (let li = 0; li < detectedLabels.length; li++) {
          const labelInfo = detectedLabels[li];
          const nextLabelX = li < detectedLabels.length - 1 
            ? detectedLabels[li + 1].x 
            : Infinity;
          
          // Collect items from next line within this label's column range
          const valParts: string[] = [];
          for (const ni of nextItems) {
            if (ni.x >= labelInfo.x - 20 && ni.x < nextLabelX - 10) {
              const val = ni.str.trim();
              if (val && !isStructuralWord(val)) {
                valParts.push(val);
              }
            }
          }
          
          if (valParts.length > 0) {
            add(labelInfo.label, valParts.join(' '));
          }
        }
      }
    }
  }

  return fields;
};

// ======== Main entry points ========

/**
 * Detect a rotated/landscape table layout where column headers (CÓD., DESCRIÇÃO,
 * REFERÊNCIA, VENCIMENTOS, DESCONTOS) share the same X position but have different
 * Y positions, and event data is grouped by X coordinate.
 */
const extractEventsRotated = (allItems: TextItem[]): {
  eventos: PayslipEvent[];
  headerYPositions: { codY: number; descY: number; refY: number; vencY: number; desctoY: number } | null;
} => {
  // Find column headers at the same X position
  const codItem = allItems.find(it => /^C[OÓ]D\.?$/i.test(it.str.trim()));
  const descItem = allItems.find(it => /^DESCRI[CÇ][AÃ]O$/i.test(it.str.trim()));
  const refItem = allItems.find(it => /^REFER[EÊ]NCIA$/i.test(it.str.trim()));
  const vencItem = allItems.find(it => /^VENCIMENTOS$/i.test(it.str.trim()));
  const desctoItem = allItems.find(it => /^DESCONTOS$/i.test(it.str.trim()));

  if (!codItem || !descItem || !vencItem || !desctoItem) {
    return { eventos: [], headerYPositions: null };
  }

  // Check if headers share similar X (within 10px) = rotated layout
  const headerX = codItem.x;
  const allHeadersSameX = [descItem, vencItem, desctoItem].every(it => Math.abs(it.x - headerX) < 15);
  if (!allHeadersSameX) {
    return { eventos: [], headerYPositions: null };
  }

  const codY = codItem.y;
  const descY = descItem.y;
  const refY = refItem?.y ?? 0;
  const vencY = vencItem.y;
  const desctoY = desctoItem.y;

  // Group all items by X position (tolerance 3px)
  const xGroups = new Map<number, TextItem[]>();
  for (const it of allItems) {
    let foundGroup = false;
    for (const [groupX, items] of xGroups) {
      if (Math.abs(it.x - groupX) < 3) {
        items.push(it);
        foundGroup = true;
        break;
      }
    }
    if (!foundGroup) {
      xGroups.set(it.x, [it]);
    }
  }

  // Define Y zones between headers. In PDF coords, Y increases upward.
  // Headers sorted by Y ascending: codY < descY < refY < vencY < desctoY
  // Values for a field fall between that header's Y and the next header's Y.
  const sortedHeaders = [
    { name: 'code', y: codY },
    { name: 'desc', y: descY },
    { name: 'ref', y: refY },
    { name: 'venc', y: vencY },
    { name: 'descto', y: desctoY },
  ].filter(h => h.y > 0).sort((a, b) => a.y - b.y);

  // Classify a Y coordinate into the nearest header zone
  const classifyY = (y: number): string => {
    let closest = sortedHeaders[0];
    let minDist = Infinity;
    for (const h of sortedHeaders) {
      const dist = Math.abs(y - h.y);
      if (dist < minDist) {
        minDist = dist;
        closest = h;
      }
    }
    return closest.name;
  };

  // Find X groups that contain event codes
  const eventos: PayslipEvent[] = [];

  for (const [groupX, items] of xGroups) {
    // Skip the header column itself
    if (Math.abs(groupX - headerX) < 5) continue;
    // Skip columns far to the right (footer labels like SALÁRIO BASE, etc.)
    if (groupX > headerX + 300) continue;

    // Classify each item in this X group by zone
    const byZone: Record<string, TextItem[]> = {};
    for (const it of items) {
      const zone = classifyY(it.y);
      if (!byZone[zone]) byZone[zone] = [];
      byZone[zone].push(it);
    }

    // Find code
    const codeItems = (byZone['code'] || []).filter(it => /^\d{3,4}$/.test(it.str.trim()));
    if (codeItems.length === 0) continue;
    const codigo = codeItems[0].str.trim();

    // Find description
    const descItems = (byZone['desc'] || []).filter(it => !/^\d+$/.test(it.str.trim()));
    const descricao = descItems[0]?.str.trim() || '';
    if (!descricao) continue;

    // Find referência
    const refItems = (byZone['ref'] || []).filter(it => /^[\d.,]+$/.test(it.str.trim()));
    const referencia = refItems[0]?.str.trim() || '';

    // Find vencimento
    const vencItems = (byZone['venc'] || []).filter(it => /^[\d.,]+$/.test(it.str.trim()));
    const vencimento = vencItems[0]?.str.trim() || '0';

    // Find desconto
    const desctoItems = (byZone['descto'] || []).filter(it => /^[\d.,]+$/.test(it.str.trim()));
    const desconto = desctoItems[0]?.str.trim() || '0';

    eventos.push({ codigo, descricao, referencia, vencimento, desconto });
  }

  // Sort events by their X position (visual order in rotated layout)
  eventos.sort((a, b) => {
    const aCode = parseInt(a.codigo);
    const bCode = parseInt(b.codigo);
    return aCode - bCode;
  });

  return { eventos, headerYPositions: { codY, descY, refY, vencY, desctoY } };
};

export const extractPattern1aPage = (items: TextItem[]): {
  month: ExtractedMonth;
  employeeName: string;
  cnpj: string;
} => {
  const lines = groupIntoLines(items);

  // Extract header/employee/footer/bank using existing block extractors
  const header = extractHeader(lines);
  const employee = extractEmployee(lines);
  const footer = extractFooter(lines);
  const bank = extractBankInfo(lines);

  // Extract events (structured table) - try standard first
  let { eventos, totalVencimentos, totalDescontos, valorLiquido, period: eventPeriod, headerIdx, endIdx } = extractEvents(lines);

  // If standard extraction found no events, try rotated layout
  if (eventos.length === 0) {
    const rotated = extractEventsRotated(items);
    if (rotated.eventos.length > 0) {
      eventos = rotated.eventos;
      // headerIdx/endIdx stay -1 so extractAllFields scans all lines
    }
  }

  // Extract ALL label-value pairs dynamically (truly generic)
  const dynamicFields = extractAllFields(lines, headerIdx, endIdx);

  // Build unified fields[] from all sources, deduplicating
  const fields: ExtractedField[] = [...dynamicFields];
  const existingKeys = new Set(fields.map(f => `${f.key.toLowerCase()}::${f.value}`));
  const addIfNew = (key: string, value: string) => {
    if (!value) return;
    const uid = `${key.toLowerCase()}::${value}`;
    if (existingKeys.has(uid)) return;
    // Also skip if same key already exists (first wins)
    if (fields.some(f => f.key.toLowerCase() === key.toLowerCase())) return;
    fields.push({ key, value });
    existingKeys.add(uid);
  };

  // Add header fields
  addIfNew('Empresa', header.empresa);
  addIfNew('CNPJ', header.cnpj);
  addIfNew('Local', header.local);
  addIfNew('Centro de Custo', header.centroCusto);
  addIfNew('Tipo de Folha', header.tipoFolha);
  addIfNew('Competência', header.competencia);
  addIfNew('Folha Nº', header.folhaNumero);

  // Add employee fields
  addIfNew('Código Funcionário', employee.codigo);
  addIfNew('Nome Funcionário', employee.nome);
  addIfNew('CBO', employee.cbo);
  addIfNew('Departamento', employee.departamento);
  addIfNew('Filial', employee.filial);
  addIfNew('Cargo', employee.cargo);
  addIfNew('Data de Admissão', employee.dataAdmissao);
  addIfNew('Endereço', employee.endereco);
  addIfNew('Bairro', employee.bairro);
  addIfNew('Cidade', employee.cidade);
  addIfNew('CEP', employee.cep);
  addIfNew('UF', employee.uf);
  addIfNew('PIS', employee.pis);
  addIfNew('CPF', employee.cpf);
  addIfNew('Identidade', employee.identidade);
  addIfNew('Data Crédito', employee.dataCredito);
  addIfNew('Dep. Sal. Fam.', employee.depSalFam);
  addIfNew('Dep IR', employee.depIR);
  addIfNew('Dep SF', employee.depSF);

  // Add footer fields
  addIfNew('Salário Base', footer.salarioBase);
  addIfNew('Salário Contr. INSS', footer.salarioContrInss);
  addIfNew('Faixa IRRF', footer.faixaIrrf);
  addIfNew('Base INSS', footer.baseInss);
  addIfNew('Base FGTS', footer.baseFgts);
  addIfNew('FGTS do Mês', footer.fgtsMes);
  addIfNew('Base IRRF', footer.baseIrrf);
  addIfNew('IRRF', footer.irrf);

  // Add bank fields
  addIfNew('Banco', bank.banco);
  addIfNew('Agência', bank.agencia);
  addIfNew('Conta Corrente', bank.contaCorrente);

  // Add totals (from events first, then footer as fallback)
  // Use force-add for totals: these should override any generic scanner values
  const forceAdd = (key: string, value: string) => {
    if (!value) return;
    const idx = fields.findIndex(f => f.key.toLowerCase() === key.toLowerCase());
    if (idx >= 0) {
      fields[idx].value = value;
    } else {
      fields.push({ key, value });
    }
  };
  forceAdd('Total Vencimentos', totalVencimentos || footer.totalVencimentos);
  forceAdd('Total Descontos', totalDescontos || footer.totalDescontos);
  forceAdd('Valor Líquido', valorLiquido || footer.valorLiquido);

  // Capture birthday/observation messages
  for (const line of lines) {
    if (/PARAB[EÉ]NS/i.test(line.text)) {
      addIfNew('Observações', line.text.replace(/^\*+\s*|\s*\*+$/g, '').trim());
    }
  }

  // Helper to find a field by regex
  const findField = (regex: RegExp): string => {
    const f = fields.find(f => regex.test(f.key));
    return f?.value || '';
  };

  const empresa = findField(/Empresa/i);
  const cnpj = findField(/CNPJ/i);
  const nome = findField(/Nome/i);
  const competencia = findField(/Compet[eê]ncia/i) || header.competencia;
  const period = eventPeriod || header.period || competencia;

  return {
    month: {
      month: period,
      fields,
      competencia: competencia || period,
      eventos,
      totalVencimentos: totalVencimentos || footer.totalVencimentos,
      totalDescontos: totalDescontos || footer.totalDescontos,
      valorLiquido: valorLiquido || footer.valorLiquido,
    },
    employeeName: nome,
    cnpj,
  };
};

// ======== Annual Report (PLANOVA-style) ========

/**
 * Detect if the document is an annual report where events span multiple months
 * across pages with a "Mês / Ano" or "Data" column in the event table header.
 */
const isAnnualReport = (pagesItems: TextItem[][]): boolean => {
  // Step 1: Check for "Mês / Ano" column in event table headers (first 3 pages)
  let hasMesAnoColumn = false;
  for (let p = 0; p < Math.min(3, pagesItems.length); p++) {
    const lines = groupIntoLines(pagesItems[p]);
    for (const line of lines) {
      const text = line.text;
      // "Mês / Ano" + "Evento/Código" or "Discriminação/Descrição"
      if (/M[eê]s\s*\/?\s*Ano/i.test(text) &&
          (/Evento|C[oó]d/i.test(text) || /Discrimina|Descri/i.test(text))) {
        hasMesAnoColumn = true;
        break;
      }
    }
    if (hasMesAnoColumn) break;
  }

  if (!hasMesAnoColumn) return false;

  // Step 2: Negative check — if page 2 has its own header (CNPJ/Referência/Competência),
  // it's per-page payslips, NOT an annual report
  if (pagesItems.length >= 2) {
    const page2Lines = groupIntoLines(pagesItems[1]);
    const page2HeaderLines = page2Lines.slice(0, Math.min(20, page2Lines.length));
    const page2HasOwnHeader = page2HeaderLines.some(l =>
      /CNPJ[:\s]*\d/i.test(l.text) ||
      /\bCNPJ\b/i.test(l.text) ||
      /Demonstrativo\s+de\s+Pagamento/i.test(l.text) ||
      /Refer[eê]ncia[:\s]*\d/i.test(l.text) ||
      /Compet[eê]ncia[:\s]*\d/i.test(l.text)
    );
    if (page2HasOwnHeader) return false;
  }

  return true;
};

interface AnnualRawEvent {
  month: string;
  codigo: string;
  descricao: string;
  referencia: string;
  valor: string;
  tipo?: 'vencimento' | 'desconto'; // when positional parser knows the column
}

/**
 * Extract annual report (PLANOVA-style) where events span multiple months
 * across multiple pages with a single header block.
 * Events appear TWICE per month per código+descrição: first = vencimento, second = desconto.
 */
const extractAnnualReport = (pagesItems: TextItem[][]): Pattern1aResult => {
  // 1. Extract header/employee/bank from page 1
  const page1Lines = groupIntoLines(pagesItems[0]);
  const header = extractHeader(page1Lines);
  const employee = extractEmployee(page1Lines);
  const bank = extractBankInfo(page1Lines);

  // Extract dynamic fields from page 1 header area
  const { headerIdx: p1HeaderIdx } = detectEventHeader(page1Lines);
  const headerDynamicFields = extractAllFields(page1Lines, p1HeaderIdx, page1Lines.length);

  // 2. Collect raw events from ALL pages
  const rawEvents: AnnualRawEvent[] = [];
  let currentMonth = '';

  for (let p = 0; p < pagesItems.length; p++) {
    const lines = groupIntoLines(pagesItems[p]);
    const { headerIdx, vencX, descX, refX } = detectEventHeader(lines);
    const hasSeparateColumns = vencX !== null && descX !== null && Math.abs(vencX - descX) > 60;

    const startIdx = headerIdx >= 0 ? headerIdx + 1 : 0;

    for (let i = startIdx; i < lines.length; i++) {
      const line = lines[i];
      const text = line.text.trim();

      if (!text) continue;
      if (isStructuralLine(text)) continue;
      if (/^Fls\.?\s*:/i.test(text)) continue;
      if (/Documento\s+assinado/i.test(text)) continue;
      if (/Composi[cç][aã]o\s+do\s+Sal[aá]rio/i.test(text)) continue;
      if (/Sal[aá]rio\s+Fixo/i.test(text)) continue;
      if (/BANCO\s+\w/i.test(text) && !/^\d{3,4}\s/.test(text)) continue;
      if (/^(Matr[ií]cula|Nome|Fun[cç][aã]o|Bairro|Cidade|PIS|CPF)/i.test(text)) continue;
      if (/^(Empresa|CNPJ|Demonstrativo)/i.test(text)) continue;
      if (/Parab[eé]ns/i.test(text)) continue;

      // Footer - stop processing events
      if (/Base\s+(?:para\s+|C[aá]lc?\.?\s*)?FGTS/i.test(text)) break;
      if (/Total\s+de\s+(Proventos|Vencimentos|Desconto)/i.test(text)) break;
      if (/L[ií]quido\s+a\s+Receber/i.test(text)) break;
      if (/Sal\.\s*Cont?\.\s*INSS/i.test(text)) break;
      if (/Base\s+C[aá]l.*IRRF/i.test(text)) break;
      if (/Base\s+IR\s+PLR/i.test(text)) break;
      if (/Pens[aã]o\s+Alim/i.test(text)) break;

      // Standalone month heading: "5/2022" or "5 / 2022" or "10/2022"
      const monthHeading = text.match(/^(\d{1,2})\s*\/\s*(\d{4})\s*$/);
      if (monthHeading) {
        currentMonth = `${monthHeading[1].padStart(2, '0')}/${monthHeading[2]}`;
        continue;
      }

      // Extract month prefix from event line: "M/YYYY CODE ..." or "M / YYYY CODE ..."
      let eventText = text;
      const monthPrefix = text.match(/^(\d{1,2})\s*\/\s*(\d{4})\s+/);
      if (monthPrefix) {
        currentMonth = `${monthPrefix[1].padStart(2, '0')}/${monthPrefix[2]}`;
        eventText = text.substring(monthPrefix[0].length);
      }

      if (!currentMonth) continue;

      // Try positional parsing on pages with separate Proventos/Descontos columns
      if (hasSeparateColumns) {
        const posEvent = parseEventLineByItems(line, vencX!, descX!, refX);
        if (posEvent) {
          const isVenc = posEvent.vencimento !== '0' && posEvent.vencimento !== '';
          const isDesc = posEvent.desconto !== '0' && posEvent.desconto !== '';
          if (isVenc) {
            rawEvents.push({
              month: currentMonth, codigo: posEvent.codigo, descricao: posEvent.descricao,
              referencia: posEvent.referencia, valor: posEvent.vencimento, tipo: 'vencimento',
            });
          }
          if (isDesc) {
            rawEvents.push({
              month: currentMonth, codigo: posEvent.codigo, descricao: posEvent.descricao,
              referencia: posEvent.referencia, valor: posEvent.desconto, tipo: 'desconto',
            });
          }
          if (isVenc || isDesc) continue;
        }
      }

      // Text-based parsing: CODE DESC [REF] VALUE
      const eventMatch = eventText.match(/^(\d{3,4})\s+(.+?)\s+([\d.,]+(?:\s+[\d.,]+)?)\s*$/);
      if (eventMatch) {
        const codigo = eventMatch[1];
        const descricao = eventMatch[2].replace(/\s+/g, ' ').trim();
        const valuesStr = eventMatch[3];
        const values = valuesStr.match(/[\d.,]+/g) || [];

        // Skip footer-like lines
        if (/Sal[aá]rio|Base\s+FGTS|Total|L[ií]quido/i.test(descricao)) continue;

        let referencia = '';
        let valor = '';

        if (values.length === 1) {
          valor = values[0];
        } else if (values.length >= 2) {
          referencia = values[0];
          valor = values[1];
        }

        if (valor) {
          // Use isDescontoByCode to set tipo for single-occurrence events
          const tipo = isDescontoByCode(codigo, descricao) ? 'desconto' : 'vencimento';
          rawEvents.push({ month: currentMonth, codigo, descricao, referencia, valor, tipo });
        }
      }
    }
  }

  // 3. Extract footer from last page
  const lastPageLines = groupIntoLines(pagesItems[pagesItems.length - 1]);
  const footer = extractFooter(lastPageLines);

  // 4. Group by month and deduplicate
  const monthMap = new Map<string, AnnualRawEvent[]>();
  for (const ev of rawEvents) {
    if (!monthMap.has(ev.month)) monthMap.set(ev.month, []);
    monthMap.get(ev.month)!.push(ev);
  }

  // Sort months chronologically
  const sortedMonthKeys = Array.from(monthMap.keys()).sort((a, b) => {
    const [ma, ya] = a.split('/').map(Number);
    const [mb, yb] = b.split('/').map(Number);
    return ya !== yb ? ya - yb : ma - mb;
  });

  // Build fields from header/employee/bank (shared across months)
  const sharedFields: ExtractedField[] = [...headerDynamicFields];
  const existingKeys = new Set(sharedFields.map(f => `${f.key.toLowerCase()}::${f.value}`));
  const addSharedField = (key: string, value: string) => {
    if (!value) return;
    const uid = `${key.toLowerCase()}::${value}`;
    if (existingKeys.has(uid)) return;
    if (sharedFields.some(f => f.key.toLowerCase() === key.toLowerCase())) return;
    sharedFields.push({ key, value });
    existingKeys.add(uid);
  };

  addSharedField('Empresa', header.empresa);
  addSharedField('CNPJ', header.cnpj);
  addSharedField('Local', header.local);
  addSharedField('Centro de Custo', header.centroCusto);
  addSharedField('Tipo de Folha', header.tipoFolha);
  addSharedField('Código Funcionário', employee.codigo);
  addSharedField('Nome Funcionário', employee.nome);
  addSharedField('CBO', employee.cbo);
  addSharedField('Cargo', employee.cargo);
  addSharedField('Data de Admissão', employee.dataAdmissao);
  addSharedField('Endereço', employee.endereco);
  addSharedField('Bairro', employee.bairro);
  addSharedField('Cidade', employee.cidade);
  addSharedField('CEP', employee.cep);
  addSharedField('UF', employee.uf);
  addSharedField('PIS', employee.pis);
  addSharedField('CPF', employee.cpf);
  addSharedField('Identidade', employee.identidade);
  addSharedField('Data Crédito', employee.dataCredito);
  addSharedField('Dep. Sal. Fam.', employee.depSalFam);
  addSharedField('Dep IR', employee.depIR);
  addSharedField('Dep SF', employee.depSF);
  addSharedField('Banco', bank.banco);
  addSharedField('Agência', bank.agencia);
  addSharedField('Conta Corrente', bank.contaCorrente);
  addSharedField('Salário Base', footer.salarioBase);
  addSharedField('Base FGTS', footer.baseFgts);
  addSharedField('FGTS do Mês', footer.fgtsMes);
  addSharedField('Base IRRF', footer.baseIrrf);
  addSharedField('Total Vencimentos', footer.totalVencimentos);
  addSharedField('Total Descontos', footer.totalDescontos);
  addSharedField('Valor Líquido', footer.valorLiquido);

  const months: ExtractedMonth[] = [];

  for (const monthKey of sortedMonthKeys) {
    const events = monthMap.get(monthKey)!;

    // Dedup: if tipo is known (positional), use it directly.
    // Otherwise (text-based), first occurrence = vencimento, second = desconto.
    const deduped: PayslipEvent[] = [];
    const seen = new Map<string, number>(); // key -> index in deduped

    for (const ev of events) {
      const key = `${ev.codigo}|${ev.descricao}`;

      if (ev.tipo) {
        // Positional parser already knows the column
        if (!seen.has(key)) {
          seen.set(key, deduped.length);
          deduped.push({
            codigo: ev.codigo,
            descricao: ev.descricao,
            referencia: ev.referencia,
            vencimento: ev.tipo === 'vencimento' ? ev.valor : '0',
            desconto: ev.tipo === 'desconto' ? ev.valor : '0',
          });
        } else {
          const idx = seen.get(key)!;
          if (ev.tipo === 'vencimento') deduped[idx].vencimento = ev.valor;
          else deduped[idx].desconto = ev.valor;
          if (ev.referencia && !deduped[idx].referencia) deduped[idx].referencia = ev.referencia;
        }
      } else {
        // Text-based: first = vencimento, second = desconto
        if (!seen.has(key)) {
          seen.set(key, deduped.length);
          deduped.push({
            codigo: ev.codigo,
            descricao: ev.descricao,
            referencia: ev.referencia,
            vencimento: ev.valor,
            desconto: '0',
          });
        } else {
          const idx = seen.get(key)!;
          deduped[idx].desconto = ev.valor;
          if (ev.referencia && !deduped[idx].referencia) deduped[idx].referencia = ev.referencia;
          seen.delete(key);
        }
      }

    }

    months.push({
      month: monthKey,
      fields: sharedFields.map(f => ({ ...f })), // clone for each month
      competencia: monthKey,
      eventos: deduped,
      totalVencimentos: '',
      totalDescontos: '',
      valorLiquido: '',
    });
  }

  // Add footer totals to the last month
  if (months.length > 0) {
    const last = months[months.length - 1];
    last.totalVencimentos = footer.totalVencimentos;
    last.totalDescontos = footer.totalDescontos;
    last.valorLiquido = footer.valorLiquido;
  }

  const employeeName = employee.nome || sharedFields.find(f => /Nome/i.test(f.key))?.value || '';
  const cnpj = header.cnpj || sharedFields.find(f => /CNPJ/i.test(f.key))?.value || '';

  return { employeeName, cnpj, months };
};

/**
 * Detect if a single page contains multiple payslips by looking for
 * repeated header patterns (CNPJ, Competência, event table headers).
 * Returns split boundaries (Y positions) or null if single payslip.
 */
const detectMultiPayslipBoundaries = (items: TextItem[]): number[] | null => {
  const lines = groupIntoLines(items);
  
  // Find lines with CNPJ patterns (each payslip has its own CNPJ line in the header)
  const cnpjLineYs: number[] = [];
  for (const line of lines) {
    const normalizedText = line.text.replace(/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g, '-');
    if (/CNPJ[:\s]*([\d./-]+)/i.test(normalizedText) || /(\d{2}\.\d{3}\.\d{3}\/\d{4}[.-]\d{2})/.test(normalizedText)) {
      cnpjLineYs.push(line.y);
    }
  }

  // If only 0 or 1 CNPJ found, it's a single payslip
  if (cnpjLineYs.length <= 1) return null;

  // Sort Y positions (PDF Y axis: higher Y = lower on page for our grouped lines)
  cnpjLineYs.sort((a, b) => a - b);

  // Calculate split boundaries: midpoint between consecutive CNPJ lines
  const boundaries: number[] = [];
  for (let i = 0; i < cnpjLineYs.length - 1; i++) {
    // Find the actual boundary by looking for the start of the next payslip header
    // Use a point slightly above the next CNPJ line
    const midY = (cnpjLineYs[i] + cnpjLineYs[i + 1]) / 2;
    boundaries.push(midY);
  }

  return boundaries;
};

/**
 * Split page items into multiple segments based on Y boundaries.
 * Each segment represents a separate payslip on the same page.
 */
const splitPageItems = (items: TextItem[], boundaries: number[]): TextItem[][] => {
  // Sort boundaries
  const sortedBounds = [...boundaries].sort((a, b) => a - b);
  
  // Create segments
  const segments: TextItem[][] = Array.from({ length: sortedBounds.length + 1 }, () => []);
  
  for (const item of items) {
    let segIdx = 0;
    for (let i = 0; i < sortedBounds.length; i++) {
      if (item.y > sortedBounds[i]) {
        segIdx = i + 1;
      }
    }
    segments[segIdx].push(item);
  }

  // Filter out empty segments
  return segments.filter(seg => seg.length > 0);
};

export const extractPattern1a = (pagesItems: TextItem[][]): Pattern1aResult => {
  // Check if this is an annual report (PLANOVA-style)
  if (isAnnualReport(pagesItems)) {
    return extractAnnualReport(pagesItems);
  }

  let employeeName = '';
  let cnpj = '';
  const months: ExtractedMonth[] = [];

  for (const pageItems of pagesItems) {
    // Check if this page contains multiple payslips
    const boundaries = detectMultiPayslipBoundaries(pageItems);
    
    const segments = boundaries ? splitPageItems(pageItems, boundaries) : [pageItems];

    for (const segmentItems of segments) {
      const result = extractPattern1aPage(segmentItems);

      if (result.employeeName && !employeeName) employeeName = result.employeeName;
      if (result.cnpj && !cnpj) cnpj = result.cnpj;

      if (result.month.fields.length > 0 || (result.month.eventos && result.month.eventos.length > 0)) {
        // Duplicate page filtering: skip if same period + same totalVencimentos already exists
        const isDuplicate = months.some(m =>
          m.month === result.month.month &&
          m.totalVencimentos === result.month.totalVencimentos &&
          m.totalVencimentos !== ''
        );
        if (!isDuplicate) {
          months.push(result.month);
        }
      }
    }
  }

  return { employeeName, cnpj, months };
};

/**
 * Apply an ExtractionTemplate to extracted months:
 * - Rename fields where mappedKey differs from originalKey
 * - Remove fields marked as ignored
 */
export const applyTemplate = (months: ExtractedMonth[], template: ExtractionTemplate): ExtractedMonth[] => {
  return months.map(month => {
    const updatedFields = (month.fields || [])
      .filter(f => {
        // Match by original key (stored or current)
        const origKey = f._originalKey || f.key;
        const mapping = template.field_mappings.find(m => m.originalKey === origKey);
        return !mapping || !mapping.ignore;
      })
      .map(f => {
        const origKey = f._originalKey || f.key;
        const mapping = template.field_mappings.find(m => m.originalKey === origKey);
        if (mapping && mapping.mappedKey !== mapping.originalKey) {
          return { ...f, key: mapping.mappedKey, _originalKey: origKey };
        }
        // Preserve _originalKey even when no rename happens
        return { ...f, _originalKey: origKey };
      });
    return { ...month, fields: updatedFields };
  });
};
