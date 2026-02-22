import { ExtractedMonth, ExtractedField, PayslipEvent } from '@/types';
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
};

const MONTH_LABELS: Record<string, string> = {
  'janeiro': 'Janeiro', 'fevereiro': 'Fevereiro', 'marco': 'Março', 'março': 'Março',
  'abril': 'Abril', 'maio': 'Maio', 'junho': 'Junho',
  'julho': 'Julho', 'agosto': 'Agosto', 'setembro': 'Setembro',
  'outubro': 'Outubro', 'novembro': 'Novembro', 'dezembro': 'Dezembro',
};

// ======== Helpers ========

/** Known labels that should NOT be treated as values */
const KNOWN_LABELS = /^(Empresa|CNPJ|Nome|Matr[ií]cula|Mat\.|Fun[cç][aã]o|Cargo|Bairro|Cidade|CEP|UF|Endere[cç]o|PIS|CPF|Identidade|Data\s*(Cr[eé]dito|Admiss[aã]o)|Dep\.?\s*sal|Banco|Ag[eê]ncia|C\/C|Conta|Compet[eê]ncia|Registro|Sal[aá]rio|Ref|Proventos|Descontos|Vencimentos|Discrimina|Evento|C[oó]digo|Descri[cç]|Local|Composi[cç]|IR$|Demonstrativo|Pagamento|Mensal|Total|Folha|Mensalista|Horista|Centro|Custo)$/i;

/** Check if a string looks like a pure value (not a label) */
const isValue = (s: string): boolean => {
  const trimmed = s.trim();
  if (!trimmed) return false;
  if (KNOWN_LABELS.test(trimmed)) return false;
  return true;
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

/**
 * Dynamically scan lines for ALL label-value pairs.
 * This captures fields regardless of their names.
 */
const extractDynamicFields = (lines: LayoutLine[], eventsStartIdx: number, eventsEndIdx: number): ExtractedField[] => {
  const fields: ExtractedField[] = [];
  const seen = new Set<string>();
  
  const addField = (key: string, value: string) => {
    const k = key.trim();
    const v = value.trim();
    if (!k || !v || k.length < 2) return;
    // Skip pure numbers as keys or very short keys
    if (/^\d+$/.test(k)) return;
    const uid = `${k}::${v}`;
    if (seen.has(uid)) return;
    seen.add(uid);
    fields.push({ key: k, value: v });
  };

  for (let i = 0; i < lines.length; i++) {
    // Skip event table lines
    if (i >= eventsStartIdx && i <= eventsEndIdx) continue;
    
    const items = lines[i].items;
    
    // Scan items looking for label-value patterns
    let j = 0;
    while (j < items.length) {
      const item = items[j];
      const str = item.str.trim();
      
      // Check if this looks like a label (ends with known pattern or is followed by a value)
      // Labels ending with ":"
      if (str.endsWith(':') && str.length > 1) {
        const label = str.replace(/:$/, '').trim();
        const valueParts: string[] = [];
        let k = j + 1;
        while (k < items.length) {
          const next = items[k].str.trim();
          if (!next) { k++; continue; }
          // Stop at next label-like item
          if (next.endsWith(':') && next.length > 1) break;
          if (KNOWN_LABELS.test(next) && k > j + 1) break;
          valueParts.push(next);
          k++;
        }
        if (valueParts.length > 0) {
          addField(label, valueParts.join(' '));
        }
        j = k;
        continue;
      }
      
      // Check for known label patterns without ":"
      if (KNOWN_LABELS.test(str) && j + 1 < items.length) {
        const label = str;
        const valueParts: string[] = [];
        let k = j + 1;
        while (k < items.length) {
          const next = items[k].str.trim();
          if (!next) { k++; continue; }
          if (KNOWN_LABELS.test(next)) break;
          // Stop at items too far away (likely different section)
          valueParts.push(next);
          k++;
          // For single-value labels, just get the first value
          if (valueParts.length >= 3) break;
        }
        if (valueParts.length > 0) {
          addField(label, valueParts.join(' '));
        }
        j = k;
        continue;
      }
      
      j++;
    }
  }
  
  return fields;
};

/**
 * Find the X position of a label in a line's items, handling multi-word labels.
 * For combined items, only matches when the regex matches at the START of the combination.
 */
const findLabelXInItems = (items: TextItem[], labelRegex: RegExp): number => {
  // Strategy 1: single item match
  for (const it of items) {
    if (labelRegex.test(it.str.trim())) return it.x;
  }
  // Strategy 2: combined consecutive items (match must start near index 0)
  for (let j = 0; j < items.length; j++) {
    for (let len = 2; len <= Math.min(5, items.length - j); len++) {
      const combined = items.slice(j, j + len).map(it => it.str).join(' ');
      const match = combined.match(labelRegex);
      if (match && match.index !== undefined && match.index <= 2) {
        return items[j].x;
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
} => {
  const result = { empresa: '', cnpj: '', centroCusto: '', tipoFolha: '', competencia: '', period: '', folhaNumero: '' };
  
  const headerEnd = Math.min(15, lines.length);
  
  for (let i = 0; i < headerEnd; i++) {
    const line = lines[i];
    const text = line.text;
    const items = line.items;
    
    // CNPJ - multiple formats
    if (!result.cnpj) {
      const cnpjMatch = text.match(/CNPJ[:\s]*([\d./-]+)/i) || text.match(/(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})/);
      if (cnpjMatch) result.cnpj = cnpjMatch[1].trim();
    }
    
    // Empresa - look for labeled "Empresa" field
    if (!result.empresa) {
      // "Empresa" label followed by value on same line (item-based)
      for (let j = 0; j < items.length; j++) {
        if (/^Empresa$/i.test(items[j].str.trim())) {
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
      
      // Fallback: line after "Empresa" label or first non-label line
      if (!result.empresa) {
        const cleaned = text.replace(/[\d./-]+/g, '').replace(/CNPJ|Codigo|Folha|Mensalista|C[oó]digo|Descri[cç]|Evento|Discrimina|Demonstrativo|Pagamento|Mensal/gi, '').trim();
        if (cleaned.length > 5 && /[A-ZÀ-Ú]{2,}/.test(cleaned)) {
          // Check it's not just a person's name (employee) - look for company indicators
          if (/LTDA|S\.?A\.?|EIRELI|ME\b|EPP|COMERCIAL|IND|COM\b|CENTRO|UNIFICADO|FEDERAL|SERVICO|GRUPO/i.test(cleaned)) {
            result.empresa = cleaned;
          }
        }
      }
    }
    
    // If we find "Empresa" label on this line and value on next line
    if (!result.empresa && /^Empresa$/i.test(text.trim()) && i + 1 < headerEnd) {
      const nextText = lines[i + 1].text.replace(/CNPJ.*$/i, '').trim();
      if (nextText.length > 3) result.empresa = nextText;
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
      } else if (/Demonstrativo\s+de\s+Pagamento\s+Mensal/i.test(text)) {
        result.tipoFolha = 'Folha Mensal';
      }
    }
    
    // Competencia (month/year) - multiple formats
    if (!result.competencia) {
      // "Janeiro de 2024" format
      const compMatch = text.match(/(Janeiro|Fevereiro|Mar[cç]o|Abril|Maio|Junho|Julho|Agosto|Setembro|Outubro|Novembro|Dezembro)\s+(?:de\s+)?(\d{4})/i);
      if (compMatch) {
        const monthKey = compMatch[1].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const monthNum = MONTH_NAMES[monthKey] || '??';
        const label = MONTH_LABELS[monthKey] || compMatch[1];
        result.competencia = `${label} de ${compMatch[2]}`;
        result.period = `${monthNum}/${compMatch[2]}`;
      }
      
      // "01/2024" or "Competência: 01/2024" format
      if (!result.period) {
        const numCompMatch = text.match(/(?:Compet[eê]ncia|Per[ií]odo)[:\s]*(\d{2})\/(\d{4})/i);
        if (numCompMatch) {
          result.period = `${numCompMatch[1]}/${numCompMatch[2]}`;
          if (!result.competencia) result.competencia = `${numCompMatch[1]}/${numCompMatch[2]}`;
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
} => {
  const result = {
    codigo: '', nome: '', cbo: '', departamento: '', filial: '',
    cargo: '', dataAdmissao: '', endereco: '', bairro: '', cidade: '',
    cep: '', uf: '', pis: '', cpf: '', identidade: '', dataCredito: '', depSalFam: '',
  };

  // Find the table header line to know where employee zone ends
  let tableHeaderIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const text = lines[i].text;
    if (
      (/C[oó]digo/i.test(text) && /Descri[cç][aã]o/i.test(text)) ||
      (/Evento/i.test(text) && /Discrimina[cç][aã]o/i.test(text)) ||
      (/Evento/i.test(text) && /Proventos/i.test(text))
    ) {
      tableHeaderIdx = i;
      break;
    }
  }
  
  const searchEnd = tableHeaderIdx > 0 ? tableHeaderIdx : Math.min(20, lines.length);
  
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
        if (/^Nome$/i.test(items[j].str.trim())) {
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
        const nomeMatch = text.match(/(?:Nome|Funcion[aá]rio)[:\s]*([A-ZÀ-Ú][A-ZÀ-Úa-zà-ú\s.]+?)(?:\s+Matr|\s+CPF|\s+PIS|\s*$)/i);
        if (nomeMatch) result.nome = nomeMatch[1].trim();
      }
    }
    
    // Cargo / Função
    if (!result.cargo) {
      // Item-based: "Função" or "Cargo" label
      for (let j = 0; j < items.length; j++) {
        if (/^(Fun[cç][aã]o|Cargo)$/i.test(items[j].str.trim())) {
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
            if (/^(Endere[cç]o|Bairro|Cidade|Sal[aá]rio|CEP|UF$)/i.test(val)) break;
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
        const cargoMatch = text.match(/(?:Cargo|Fun[cç][aã]o)[:\s]*([A-ZÀ-Úa-zà-ú\s./-]+?)(?:\s+Data\s*Admiss|\s+Endere|\s+\d{2}\/\d{2}\/\d{4}|\s*$)/i);
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
  
  // Find table header line - support multiple layouts
  let headerIdx = -1;
  let vencX: number | null = null;
  let descX: number | null = null;
  let refX: number | null = null;
  
  for (let i = 0; i < lines.length; i++) {
    const text = lines[i].text;
    
    // Layout A: "Código" + "Descrição" + "Vencimentos/Proventos"
    const hasCodigo = /C[oó]digo/i.test(text);
    const hasDescricao = /Descri[cç][aã]o/i.test(text);
    const hasVenc = /Vencimentos|Proventos/i.test(text);
    
    // Layout B: "Evento" + "Discriminação" + "Proventos"
    const hasEvento = /\bEvento\b/i.test(text);
    const hasDiscriminacao = /Discrimina[cç][aã]o/i.test(text);
    
    // Layout C: "Discriminação das parcelas" standalone header
    const hasDiscParcelas = /Discrimina[cç][aã]o\s+das\s+parcelas/i.test(text);
    
    if ((hasCodigo && hasDescricao && hasVenc) || (hasEvento && hasDiscriminacao && hasVenc) || (hasDiscParcelas && hasVenc)) {
      headerIdx = i;
      vencX = findColumnX(lines[i], 'Vencimentos') || findColumnX(lines[i], 'Proventos');
      descX = findColumnX(lines[i], 'Descontos');
      refX = findColumnX(lines[i], 'Refer') || findColumnX(lines[i], 'Ref');
      break;
    }
  }
  
  if (headerIdx < 0 || vencX === null || descX === null) {
    return { eventos, totalVencimentos, totalDescontos, valorLiquido, period, headerIdx: -1, endIdx: -1 };
  }
  
  // Process lines after the header until totals
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    const text = line.text;
    
    // ---- Totals detection (position-aware) ----
    
    // Total de Vencimentos / Total de Proventos
    if (/Total\s+de\s+(Vencimentos|Proventos)/i.test(text) && !totalVencimentos) {
      const v = getAlignedValue(lines, i, /Total\s+de\s+(Vencimentos|Proventos)/i);
      if (v) totalVencimentos = v;
      continue;
    }
    
    // Total de Descontos / Total de Desconto
    if (/Total\s+de\s+Desconto/i.test(text) && !totalDescontos) {
      const v = getAlignedValue(lines, i, /Total\s+de\s+Desconto/i);
      if (v) totalDescontos = v;
      continue;
    }
    
    // Valor Líquido / Líquido a Receber (with optional => arrow)
    if (/(?:Valor\s+L[ií]quido|L[ií]quido\s+a\s+Receber)/i.test(text) && !valorLiquido) {
      const v = getAlignedValue(lines, i, /L[ií]quido/i);
      if (v) valorLiquido = v;
      continue;
    }
    
    // Stop at footer labels
    if (/Sal[aá]rio\s+(Base|Fixo)/i.test(text) && !/Evento|Discrimina|Descri/i.test(text)) break;
    if (/Sal\.\s*Contr/i.test(text)) break;
    if (/Base\s+para\s+FGTS/i.test(text)) break;
    if (/Composi[cç][aã]o\s+do\s+Sal[aá]rio/i.test(text)) break;
    if (/Local\s+do\s+Pagamento/i.test(text)) break;
    
    // Try to extract period from "Mês/Ano" column (e.g. "8 / 2020")
    if (!period) {
      const periodMatch = text.match(/(\d{1,2})\s*\/\s*(\d{4})/);
      if (periodMatch) {
        const m = periodMatch[1].padStart(2, '0');
        period = `${m}/${periodMatch[2]}`;
      }
    }
    
    // Find event code - skip date components (year preceded by "/" from Mês/Ano column)
    let eventCodeItem: TextItem | undefined;
    for (let j = 0; j < line.items.length; j++) {
      const it = line.items[j];
      if (!/^\d{3,4}$/.test(it.str.trim())) continue;
      // Skip if preceded by "/" within previous 2 items (it's a year)
      let isYear = false;
      for (let k = j - 1; k >= Math.max(0, j - 2); k--) {
        if (line.items[k].str.trim() === '/') { isYear = true; break; }
      }
      if (isYear) continue;
      eventCodeItem = it;
      break;
    }
    if (!eventCodeItem) continue;
    
    const codigo = eventCodeItem.str.trim();
    
    // Description: text items after code but before numeric values
    const descItems: string[] = [];
    const numericItems: TextItem[] = [];
    let passedCode = false;
    
    for (const item of line.items) {
      if (item === eventCodeItem) { passedCode = true; continue; }
      if (!passedCode) continue;
      
      const val = item.str.trim();
      if (!val) continue;
      
      if (/^[\d.,]+$/.test(val) && val.length >= 2) {
        numericItems.push(item);
      } else if (numericItems.length === 0) {
        const itemCenterX = item.x + item.width / 2;
        if (descX !== null && itemCenterX > descX + 50) continue;
        // Skip period fragments like "8", "/", "2020" that appear before the code
        if (/^[\d/\s]+$/.test(val) && val.length <= 4) continue;
        descItems.push(val);
      } else {
        if (/^[\d.,]+$/.test(val)) numericItems.push(item);
      }
    }
    
    const descricao = descItems.join(' ').replace(/\s+/g, ' ').trim();
    if (!descricao) continue;
    
    // Classify numeric values
    let referencia = '';
    let vencimento = '0';
    let desconto = '0';
    
    for (const ni of numericItems) {
      const val = ni.str.trim();
      const centerX = ni.x + ni.width / 2;
      
      if (refX !== null && Math.abs(centerX - refX) < Math.abs(centerX - vencX!) && Math.abs(centerX - refX) < Math.abs(centerX - descX!)) {
        referencia = val;
      } else {
        const col = classifyValueColumn(centerX, vencX!, descX!);
        if (col === 'vencimento') vencimento = val;
        else desconto = val;
      }
    }
    
    eventos.push({ codigo, descricao, referencia, vencimento, desconto });
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
  salarioBase: string; baseInss: string; baseFgts: string;
  fgtsMes: string; baseIrrf: string; irrf: string;
} => {
  const result = { salarioBase: '', baseInss: '', baseFgts: '', fgtsMes: '', baseIrrf: '', irrf: '' };
  
  for (let i = 0; i < lines.length; i++) {
    const text = lines[i].text;
    
    // Style A: all labels on one compact line (e.g., "Salário Base  Sal.Contr.  Base FGTS  FGTS Mês  Base IRRF  IRRF")
    if (/Sal[aá]rio\s+Base/i.test(text) && /Sal\.\s*Contr/i.test(text)) {
      const values = lines[i].items
        .filter(it => /^[\d.,]+$/.test(it.str.trim()) && it.str.trim().includes(','))
        .sort((a, b) => a.x - b.x);
      const vals = values.length > 0 ? values : (
        i + 1 < lines.length ? lines[i + 1].items
          .filter(it => /^[\d.,]+$/.test(it.str.trim()) && it.str.trim().includes(','))
          .sort((a, b) => a.x - b.x) : []
      );
      if (vals.length >= 1) result.salarioBase = vals[0].str.trim();
      if (vals.length >= 2) result.baseInss = vals[1].str.trim();
      if (vals.length >= 3) result.baseFgts = vals[2].str.trim();
      if (vals.length >= 4) result.fgtsMes = vals[3].str.trim();
      if (vals.length >= 5) result.baseIrrf = vals[4].str.trim();
      if (vals.length >= 6) result.irrf = vals[5].str.trim();
      break;
    }
    
    // Style B: individual/grouped labels with positional value matching
    if (/Sal[aá]rio\s+(Base|Fixo)/i.test(text) && !result.salarioBase) {
      result.salarioBase = getAlignedValue(lines, i, /Sal[aá]rio/i);
    }
    if (/Composi[cç][aã]o\s+do\s+Sal[aá]rio/i.test(text) && !result.salarioBase) {
      for (let k = i + 1; k < Math.min(i + 3, lines.length); k++) {
        if (/Sal[aá]rio\s+Fixo/i.test(lines[k].text)) {
          result.salarioBase = getAlignedValue(lines, k, /Sal[aá]rio/i);
          break;
        }
      }
    }
    if (/Base\s+(?:para\s+)?FGTS/i.test(text) && !result.baseFgts) {
      result.baseFgts = getAlignedValue(lines, i, /^Base/i);
    }
    if (/FGTS\s+do\s+m[eê]s/i.test(text) && !result.fgtsMes) {
      result.fgtsMes = getAlignedValue(lines, i, /FGTS\s+do/i);
    }
    if (/Base\s+(Cal\.?\s*)?IRRF/i.test(text) && !result.baseIrrf) {
      result.baseIrrf = getAlignedValue(lines, i, /Base.*IRRF/i);
      // Fallback: first "Base" on a line that specifically has IRRF
      if (!result.baseIrrf) {
        result.baseIrrf = getAlignedValue(lines, i, /^Base/i);
      }
    }
    if (/Sal\.?\s*Cont?\.?\s*INSS/i.test(text) && !result.baseInss) {
      result.baseInss = getAlignedValue(lines, i, /^Sal/i);
    }
    if (/Base\s+INSS/i.test(text) && !result.baseInss) {
      result.baseInss = getAlignedValue(lines, i, /Base.*INSS/i);
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
    const hasBancoLabel = items.some(it => /^Banco$/i.test(it.str.trim()));
    const hasAgLabel = items.some(it => /^Ag[eê]ncia$/i.test(it.str.trim()));
    const hasCCLabel = items.some(it => /^(C\/C|Conta)$/i.test(it.str.trim()));
    
    if (hasBancoLabel || hasAgLabel || hasCCLabel) {
      // Collect label-value pairs from items on this line
      for (let j = 0; j < items.length; j++) {
        const label = items[j].str.trim();
        
        if (/^Banco$/i.test(label) && !result.banco) {
          // Next item on same line is value
          if (j + 1 < items.length) {
            const nextVal = items[j + 1].str.trim();
            if (nextVal && !/^(Ag[eê]ncia|C\/C|Conta|Local)$/i.test(nextVal)) {
              result.banco = nextVal;
            }
          }
        }
        if (/^Ag[eê]ncia$/i.test(label) && !result.agencia) {
          if (j + 1 < items.length) {
            const nextVal = items[j + 1].str.trim();
            if (nextVal && !/^(C\/C|Conta|Banco)$/i.test(nextVal) && /[\d]/.test(nextVal)) {
              result.agencia = nextVal;
            }
          }
        }
        if (/^(C\/C|Conta)$/i.test(label) && !result.contaCorrente) {
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
          
          if (/^Banco$/i.test(label) && !result.banco) {
            for (const ni of nextItems) {
              if (Math.abs(ni.x - labelX) < 100 && ni.str.trim().length > 0) {
                result.banco = ni.str.trim();
                break;
              }
            }
          }
          if (/^Ag[eê]ncia$/i.test(label) && !result.agencia) {
            for (const ni of nextItems) {
              if (Math.abs(ni.x - labelX) < 100 && /[\d-]+/.test(ni.str.trim())) {
                result.agencia = ni.str.trim();
                break;
              }
            }
          }
          if (/^(C\/C|Conta)$/i.test(label) && !result.contaCorrente) {
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
      const bankMatch = text.match(/Banco[:\s]+([\d]+)/i);
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
      const bankMatch = text.match(/(Ita[uú]|Bradesco|Santander|Caixa|Banco\s+do\s+Brasil|BB|Sicoob|Sicredi|Nu[Bb]ank|Inter|C6)/i);
      if (bankMatch) result.banco = bankMatch[1];
    }
    
    if (result.banco && result.agencia && result.contaCorrente) break;
  }
  
  return result;
};

// ======== Universal label-value scanner ========

/**
 * Scan ALL lines (outside of the events table) and extract every
 * label → value pair found. This is the primary extraction method
 * for header, employee, footer, and bank data.
 */
const extractAllFields = (
  lines: LayoutLine[],
  eventsStartIdx: number,
  eventsEndIdx: number,
): ExtractedField[] => {
  const fields: ExtractedField[] = [];
  const seen = new Set<string>();

  const add = (key: string, value: string) => {
    const k = key.trim();
    const v = value.trim();
    if (!k || !v || k.length < 2) return;
    if (/^\d+$/.test(k)) return;
    // Skip purely structural / decorative text
    if (/^(Discrimina[cç][aã]o\s+das\s+parcelas|Demonstrativo\s+de\s+Pagamento|=>)$/i.test(k)) return;
    if (/^(Fls|Documento\s+assinado|https?:)/i.test(k)) return;
    const uid = `${k}::${v}`;
    if (seen.has(uid)) return;
    seen.add(uid);
    fields.push({ key: k, value: v });
  };

  /** Labels that indicate the next item(s) are values */
  const LABEL_PATTERNS = [
    /^Empresa$/i, /^CNPJ$/i, /^Nome$/i, /^Matr[ií]cula$/i, /^Mat\.?$/i,
    /^Fun[cç][aã]o$/i, /^Cargo$/i, /^Bairro$/i, /^Cidade$/i, /^CEP$/i, /^UF$/i,
    /^Endere[cç]o$/i, /^PIS$/i, /^CPF$/i, /^Identidade$/i, /^RG$/i,
    /^Data\s*Cr[eé]dito$/i, /^Data\s*Admiss[aã]o$/i, /^Dep\.?\s*sal/i,
    /^Banco$/i, /^Ag[eê]ncia$/i, /^(C\/C|Conta\s*Corrente?)$/i,
    /^Centro\s+(de\s+)?Custo$/i, /^Compet[eê]ncia$/i, /^Registro$/i,
    /^Sal[aá]rio\s+(Base|Fixo)$/i, /^Sal\.?\s*Cont?r?\.?\s*INSS$/i,
    /^Base\s+(?:para\s+)?FGTS$/i, /^FGTS\s+do\s+m[eê]s$/i,
    /^Base\s+(?:C[aá]l\.?\s*)?IRRF$/i, /^Base\s+(?:para\s+)?INSS$/i,
    /^Pens[aã]o\s+Alim/i,
    /^Total\s+de\s+(Vencimentos|Proventos)$/i, /^Total\s+de\s+Desconto(s)?$/i,
    /^L[ií]quido\s+a\s+Receber$/i, /^Valor\s+L[ií]quido$/i,
    /^IR$/i, /^Local\s+do\s+Pagamento$/i,
    /^Folha$/i, /^Tipo\s+Folha$/i,
    /^CBO$/i, /^Departamento$/i, /^Filial$/i, /^Se[cç][aã]o$/i,
    /^Admiss[aã]o$/i,
  ];

  /** Words that are purely structural headers (not label-value) */
  const STRUCTURAL = /^(Discrimina[cç][aã]o\s+das\s+parcelas|Demonstrativo\s+de\s+Pagamento\s+Mensal|Composi[cç][aã]o\s+do\s+Sal[aá]rio|M[eê]s\s*\/\s*Ano|Evento|Discrimina[cç][aã]o|Ref|Proventos|Descontos|Vencimentos|C[oó]digo|Descri[cç][aã]o)$/i;

  const isLabel = (s: string): boolean => {
    const t = s.trim();
    if (STRUCTURAL.test(t)) return false;
    return LABEL_PATTERNS.some(p => p.test(t));
  };

  /** Check if two consecutive items form a multi-word label */
  const tryMultiWordLabel = (items: TextItem[], startIdx: number): { label: string; endIdx: number } | null => {
    if (startIdx + 1 >= items.length) return null;
    const first = items[startIdx].str.trim();
    const second = items[startIdx + 1].str.trim();
    const combined = `${first} ${second}`;
    // Also try with 3rd word
    let combined3 = combined;
    if (startIdx + 2 < items.length) {
      combined3 = `${combined} ${items[startIdx + 2].str.trim()}`;
    }
    for (const p of LABEL_PATTERNS) {
      if (p.test(combined3) && startIdx + 2 < items.length) return { label: combined3, endIdx: startIdx + 2 };
      if (p.test(combined)) return { label: combined, endIdx: startIdx + 1 };
    }
    return null;
  };

  for (let i = 0; i < lines.length; i++) {
    // Skip event table lines
    if (eventsStartIdx >= 0 && i >= eventsStartIdx && i <= eventsEndIdx) continue;
    // Skip signature / page footer lines
    if (/Documento\s+assinado/i.test(lines[i].text)) continue;
    if (/^Fls\.?:/i.test(lines[i].text.trim())) continue;
    if (/^https?:/i.test(lines[i].text.trim())) continue;
    if (/N[uú]mero\s+do\s+(processo|documento)/i.test(lines[i].text)) continue;

    const items = lines[i].items;
    let j = 0;
    while (j < items.length) {
      const str = items[j].str.trim();

      // Try colon-separated: "Label: Value"
      if (str.endsWith(':') && str.length > 1) {
        const label = str.replace(/:$/, '').trim();
        const valParts: string[] = [];
        let k = j + 1;
        while (k < items.length) {
          const next = items[k].str.trim();
          if (!next) { k++; continue; }
          if (next.endsWith(':') && next.length > 1) break;
          if (isLabel(next)) break;
          valParts.push(next);
          k++;
        }
        if (valParts.length > 0) add(label, valParts.join(' '));
        j = k;
        continue;
      }

      // Try multi-word label first
      const multi = tryMultiWordLabel(items, j);
      if (multi) {
        const valParts: string[] = [];
        let k = multi.endIdx + 1;
        while (k < items.length) {
          const next = items[k].str.trim();
          if (!next) { k++; continue; }
          if (isLabel(next)) break;
          if (tryMultiWordLabel(items, k)) break;
          if (next.endsWith(':') && next.length > 1) break;
          valParts.push(next);
          k++;
          if (valParts.length >= 5) break;
        }
        if (valParts.length > 0) add(multi.label, valParts.join(' '));
        j = k;
        continue;
      }

      // Try single-word label
      if (isLabel(str)) {
        const valParts: string[] = [];
        let k = j + 1;
        while (k < items.length) {
          const next = items[k].str.trim();
          if (!next) { k++; continue; }
          if (isLabel(next)) break;
          if (tryMultiWordLabel(items, k)) break;
          if (next.endsWith(':') && next.length > 1) break;
          valParts.push(next);
          k++;
          if (valParts.length >= 5) break;
        }
        if (valParts.length > 0) add(str, valParts.join(' '));
        j = k;
        continue;
      }

      j++;
    }
  }

  // Also extract period from events if not found
  return fields;
};

// ======== Main entry points ========

export const extractPattern1aPage = (items: TextItem[]): {
  month: ExtractedMonth;
  employeeName: string;
  cnpj: string;
} => {
  const lines = groupIntoLines(items);

  // Extract events (structured table)
  const { eventos, totalVencimentos, totalDescontos, valorLiquido, period: eventPeriod, headerIdx, endIdx } = extractEvents(lines);

  // Extract ALL label-value pairs dynamically
  const dynamicFields = extractAllFields(lines, headerIdx, endIdx);

  // Add totals as fields too
  const fields: ExtractedField[] = [...dynamicFields];
  const existingKeys = new Set(fields.map(f => f.key.toLowerCase()));
  const addIfNew = (key: string, value: string) => {
    if (!value) return;
    if (existingKeys.has(key.toLowerCase())) return;
    fields.push({ key, value });
    existingKeys.add(key.toLowerCase());
  };
  addIfNew('Total de Proventos', totalVencimentos);
  addIfNew('Total de Descontos', totalDescontos);
  addIfNew('Valor Líquido', valorLiquido);

  // Also add event summaries as fields for export
  for (const e of eventos) {
    addIfNew(e.descricao, e.vencimento !== '0' ? e.vencimento : `-${e.desconto}`);
  }

  // Extract key identifiers from fields for backward compat
  const findField = (regex: RegExp): string => {
    const f = fields.find(f => regex.test(f.key));
    return f?.value || '';
  };

  const empresa = findField(/^Empresa$/i);
  const cnpj = findField(/^CNPJ$/i);
  const nome = findField(/^(Nome|Matr[ií]cula)$/i);
  const competencia = findField(/^Compet[eê]ncia$/i);
  const period = eventPeriod || competencia;

  return {
    month: {
      month: period,
      fields,
      empresa,
      cnpj,
      competencia: competencia || period,
      nomeFuncionario: findField(/^Nome$/i),
      codigoFuncionario: findField(/^Matr[ií]cula$/i),
      cargo: findField(/^(Fun[cç][aã]o|Cargo)$/i),
      dataAdmissao: findField(/^(Data\s*Admiss[aã]o|Admiss[aã]o)$/i),
      eventos,
      totalVencimentos,
      totalDescontos,
      valorLiquido,
    },
    employeeName: findField(/^Nome$/i),
    cnpj,
  };
};

export const extractPattern1a = (pagesItems: TextItem[][]): Pattern1aResult => {
  let employeeName = '';
  let cnpj = '';
  const months: ExtractedMonth[] = [];

  for (const pageItems of pagesItems) {
    const result = extractPattern1aPage(pageItems);

    if (result.employeeName && !employeeName) employeeName = result.employeeName;
    if (result.cnpj && !cnpj) cnpj = result.cnpj;

    if (result.month.fields.length > 0 || (result.month.eventos && result.month.eventos.length > 0)) {
      months.push(result.month);
    }
  }

  return { employeeName, cnpj, months };
};
