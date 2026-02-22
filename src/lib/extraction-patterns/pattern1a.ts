import { ExtractedMonth, PayslipEvent } from '@/types';
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
          if (val && !/^(Empresa|CNPJ|Nome|Matr|Fun[cç]|Cargo|Bairro|Cidade|CEP|UF|Endere)/i.test(val)) {
            return val;
          }
        }
      }
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
} => {
  const result = { codigo: '', nome: '', cbo: '', departamento: '', filial: '', cargo: '', dataAdmissao: '' };

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
  period: string; // extracted from event rows (e.g. "8 / 2020" -> "08/2020")
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
    return { eventos, totalVencimentos, totalDescontos, valorLiquido, period };
  }
  
  // Process lines after the header until totals
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    const text = line.text;
    
    // ---- Totals detection (flexible labels) ----
    
    // Total de Vencimentos / Total de Proventos
    if (/Total\s+de\s+(Vencimentos|Proventos)/i.test(text)) {
      const vals = line.items.filter(it => /^[\d.,]+$/.test(it.str.trim()) && it.str.trim().includes(','));
      if (vals.length > 0) {
        for (const v of vals) {
          const col = classifyValueColumn(v.x + v.width / 2, vencX!, descX!);
          if (col === 'vencimento') totalVencimentos = v.str.trim();
          else totalDescontos = v.str.trim();
        }
      } else {
        const nextLine = i + 1 < lines.length ? lines[i + 1] : null;
        if (nextLine && !/Total|Valor|Sal[aá]rio|L[ií]quido/i.test(nextLine.text)) {
          const nextVals = nextLine.items.filter(it => /^[\d.,]+$/.test(it.str.trim()) && it.str.trim().includes(','));
          for (const v of nextVals) {
            const col = classifyValueColumn(v.x + v.width / 2, vencX!, descX!);
            if (col === 'vencimento') totalVencimentos = v.str.trim();
            else totalDescontos = v.str.trim();
          }
        }
      }
      continue;
    }
    
    // Total de Descontos / Total de Desconto
    if (/Total\s+de\s+Desconto/i.test(text)) {
      const vals = line.items.filter(it => /^[\d.,]+$/.test(it.str.trim()) && it.str.trim().includes(','));
      if (vals.length > 0) {
        for (const v of vals) totalDescontos = v.str.trim();
      } else {
        const nextLine = i + 1 < lines.length ? lines[i + 1] : null;
        if (nextLine && !/Total|Valor|Sal[aá]rio|L[ií]quido/i.test(nextLine.text)) {
          const nextVals = nextLine.items.filter(it => /^[\d.,]+$/.test(it.str.trim()) && it.str.trim().includes(','));
          if (nextVals.length > 0) totalDescontos = nextVals[nextVals.length - 1].str.trim();
        }
      }
      continue;
    }
    
    // Valor Líquido / Líquido a Receber (with optional => arrow)
    if (/(?:Valor\s+L[ií]quido|L[ií]quido\s+a\s+Receber)/i.test(text)) {
      const vals = line.items.filter(it => /^[\d.,]+$/.test(it.str.trim()) && it.str.trim().includes(','));
      if (vals.length > 0) {
        valorLiquido = vals[vals.length - 1].str.trim();
      } else {
        const nextLine = i + 1 < lines.length ? lines[i + 1] : null;
        if (nextLine) {
          const nextVals = nextLine.items.filter(it => /^[\d.,]+$/.test(it.str.trim()) && it.str.trim().includes(','));
          if (nextVals.length > 0) valorLiquido = nextVals[nextVals.length - 1].str.trim();
        }
      }
      continue;
    }
    
    // Stop at footer labels
    if (/Sal[aá]rio\s+(Base|Fixo)/i.test(text) && !/Evento|Discrimina|Descri/i.test(text)) break;
    if (/Sal\.\s*Contr/i.test(text)) break;
    if (/Base\s+para\s+FGTS/i.test(text)) break;
    if (/Composi[cç][aã]o\s+do\s+Sal[aá]rio/i.test(text)) break;
    if (/Local\s+do\s+Pagamento/i.test(text)) break;
    
    // Parse event line: starts with 3-4 digit code
    const codeItem = line.items.find(it => /^\d{3,4}$/.test(it.str.trim()));
    if (!codeItem) {
      // Some layouts have "Mês/Ano" before the event code (e.g. "8 / 2020  0514  DESC...")
      // Try to find code after a date-like pattern
      const altCodeItem = line.items.find(it => /^\d{4}$/.test(it.str.trim()));
      if (!altCodeItem) continue;
    }
    
    // Try to extract period from "Mês/Ano" column (e.g. "8 / 2020")
    if (!period) {
      const periodMatch = text.match(/(\d{1,2})\s*\/\s*(\d{4})/);
      if (periodMatch) {
        const m = periodMatch[1].padStart(2, '0');
        period = `${m}/${periodMatch[2]}`;
      }
    }
    
    // Find the actual event code
    const eventCodeItem = codeItem || line.items.find(it => /^\d{3,4}$/.test(it.str.trim()));
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
  
  return { eventos, totalVencimentos, totalDescontos, valorLiquido, period };
};

const extractFooter = (lines: LayoutLine[]): {
  salarioBase: string; baseInss: string; baseFgts: string;
  fgtsMes: string; baseIrrf: string; irrf: string;
} => {
  const result = { salarioBase: '', baseInss: '', baseFgts: '', fgtsMes: '', baseIrrf: '', irrf: '' };
  
  // Scan all lines for footer values using flexible label matching
  for (let i = 0; i < lines.length; i++) {
    const text = lines[i].text;
    const items = lines[i].items;
    
    // Helper: get numeric values from this line or the next
    const getValues = (lineIdx: number): TextItem[] => {
      const vals = lines[lineIdx].items
        .filter(it => /^[\d.,]+$/.test(it.str.trim()) && it.str.trim().includes(','))
        .sort((a, b) => a.x - b.x);
      if (vals.length > 0) return vals;
      
      // Try next line
      if (lineIdx + 1 < lines.length) {
        return lines[lineIdx + 1].items
          .filter(it => /^[\d.,]+$/.test(it.str.trim()) && it.str.trim().includes(','))
          .sort((a, b) => a.x - b.x);
      }
      return [];
    };
    
    // Style A: "Salário Base" + "Base INSS" + "Base FGTS" all on one label line
    if (/Sal[aá]rio\s+Base/i.test(text) && /Sal\.\s*Contr/i.test(text)) {
      const values = getValues(i);
      if (values.length >= 1) result.salarioBase = values[0].str.trim();
      if (values.length >= 2) result.baseInss = values[1].str.trim();
      if (values.length >= 3) result.baseFgts = values[2].str.trim();
      if (values.length >= 4) result.fgtsMes = values[3].str.trim();
      if (values.length >= 5) result.baseIrrf = values[4].str.trim();
      if (values.length >= 6) result.irrf = values[5].str.trim();
      break;
    }
    
    // Style B: Individual labeled fields (one per line or per section)
    // Helper: get first numeric value with comma from line or next line
    const getFirstVal = (idx: number): string => {
      const v = lines[idx].items.filter(it => /^[\d.,]+$/.test(it.str.trim()) && it.str.trim().includes(','));
      if (v.length > 0) return v[0].str.trim();
      if (idx + 1 < lines.length) {
        const nv = lines[idx + 1].items.filter(it => /^[\d.,]+$/.test(it.str.trim()) && it.str.trim().includes(','));
        if (nv.length > 0) return nv[0].str.trim();
      }
      return '';
    };

    if (/Sal[aá]rio\s+(Base|Fixo)/i.test(text) && !result.salarioBase) {
      const v = getFirstVal(i);
      if (v) result.salarioBase = v;
    }
    // "Composição do Salário" line with "Salário Fixo" value on same or next line
    if (/Composi[cç][aã]o\s+do\s+Sal[aá]rio/i.test(text) && !result.salarioBase) {
      // Look at next lines for "Salário Fixo" or just a numeric value
      for (let k = i + 1; k < Math.min(i + 3, lines.length); k++) {
        if (/Sal[aá]rio\s+Fixo/i.test(lines[k].text)) {
          const v = lines[k].items.filter(it => /^[\d.,]+$/.test(it.str.trim()) && it.str.trim().includes(','));
          if (v.length > 0) { result.salarioBase = v[0].str.trim(); break; }
        }
      }
    }
    if (/Base\s+(?:para\s+)?FGTS/i.test(text) && !result.baseFgts) {
      const v = getFirstVal(i);
      if (v) result.baseFgts = v;
    }
    if (/FGTS\s+do\s+m[eê]s/i.test(text) && !result.fgtsMes) {
      const v = getFirstVal(i);
      if (v) result.fgtsMes = v;
    }
    if (/Base\s+(Cal\.?\s*)?IRRF/i.test(text) && !result.baseIrrf) {
      const v = getFirstVal(i);
      if (v) result.baseIrrf = v;
    }
    if (/Pens[aã]o\s+Alim/i.test(text) && !result.baseIrrf) {
      // Sometimes "Pensão Alim. Extra Folha" line contains IRRF base nearby
    }
    if (/Sal\.?\s*Cont?\.?\s*INSS/i.test(text) && !result.baseInss) {
      const v = getFirstVal(i);
      if (v) result.baseInss = v;
    }
    if (/Base\s+INSS/i.test(text) && !result.baseInss) {
      const v = getFirstVal(i);
      if (v) result.baseInss = v;
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

// ======== Main entry points ========

export const extractPattern1aPage = (items: TextItem[]): {
  month: ExtractedMonth;
  employeeName: string;
  cnpj: string;
} => {
  const lines = groupIntoLines(items);
  
  const header = extractHeader(lines);
  const emp = extractEmployee(lines);
  const { eventos, totalVencimentos, totalDescontos, valorLiquido, period: eventPeriod } = extractEvents(lines);
  const footer = extractFooter(lines);
  const bank = extractBankInfo(lines);
  
  // Use period from events if header didn't find one
  const period = header.period || eventPeriod;
  const competencia = header.competencia || period;
  
  // Build legacy fields for backward compatibility
  const fields = eventos.map(e => ({
    key: e.descricao,
    value: e.vencimento !== '0' ? e.vencimento : e.desconto,
  }));
  if (totalVencimentos) fields.push({ key: 'Total de Vencimentos', value: totalVencimentos });
  if (totalDescontos) fields.push({ key: 'Total de Descontos', value: totalDescontos });
  if (valorLiquido) fields.push({ key: 'Valor Líquido', value: valorLiquido });
  if (footer.salarioBase) fields.push({ key: 'Salário Base', value: footer.salarioBase });
  
  return {
    month: {
      month: period,
      fields,
      empresa: header.empresa,
      cnpj: header.cnpj,
      centroCusto: header.centroCusto,
      tipoFolha: header.tipoFolha,
      competencia,
      folhaNumero: header.folhaNumero,
      codigoFuncionario: emp.codigo,
      nomeFuncionario: emp.nome,
      cbo: emp.cbo,
      departamento: emp.departamento,
      filial: emp.filial,
      cargo: emp.cargo,
      dataAdmissao: emp.dataAdmissao,
      eventos,
      totalVencimentos,
      totalDescontos,
      valorLiquido,
      ...footer,
      ...bank,
    },
    employeeName: emp.nome,
    cnpj: header.cnpj,
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
    
    if (result.month.fields.length > 0) {
      months.push(result.month);
    }
  }
  
  return { employeeName, cnpj, months };
};
