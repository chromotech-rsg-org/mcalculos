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

// ======== Block extractors ========

const extractHeader = (lines: LayoutLine[]): {
  empresa: string; cnpj: string; centroCusto: string;
  tipoFolha: string; competencia: string; period: string; folhaNumero: string;
} => {
  const result = { empresa: '', cnpj: '', centroCusto: '', tipoFolha: '', competencia: '', period: '', folhaNumero: '' };
  
  // First ~5 lines contain header info
  const headerLines = lines.slice(0, Math.min(6, lines.length));
  
  for (const line of headerLines) {
    const text = line.text;
    
    // Empresa: first line usually
    if (!result.empresa && !text.match(/CNPJ|Codigo|Folha|Mensalista/i)) {
      result.empresa = text.trim();
    }
    
    // CNPJ
    const cnpjMatch = text.match(/CNPJ[:\s]*([\d./-]+)/i);
    if (cnpjMatch) result.cnpj = cnpjMatch[1].trim();
    
    // Centro de Custo
    const ccMatch = text.match(/CC[:\s]*([A-ZÀ-Úa-zà-ú\s]+?)(?:\s+Folha|\s*$)/i);
    if (ccMatch) result.centroCusto = ccMatch[1].trim();
    
    // Tipo Folha
    if (/Folha\s+(Mensal|Complementar)/i.test(text)) {
      const m = text.match(/Folha\s+(Mensal|Complementar|\w+)/i);
      if (m) result.tipoFolha = m[0].trim();
    }
    if (/Mensalista/i.test(text) && !result.tipoFolha) {
      result.tipoFolha = 'Mensalista';
    }
    
    // Competencia (month/year)
    const compMatch = text.match(/(Janeiro|Fevereiro|Mar[cç]o|Abril|Maio|Junho|Julho|Agosto|Setembro|Outubro|Novembro|Dezembro)\s+de\s+(\d{4})/i);
    if (compMatch) {
      const monthKey = compMatch[1].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const monthNum = MONTH_NAMES[monthKey] || '??';
      const label = MONTH_LABELS[monthKey] || compMatch[1];
      result.competencia = `${label} de ${compMatch[2]}`;
      result.period = `${monthNum}/${compMatch[2]}`;
    }
    
    // Folha numero
    const folhaNumMatch = text.match(/(?:Folha\s+\w+\s+.*?)(\d{2,4})\s+\d{3}\s+[A-Z]/i);
    if (folhaNumMatch) result.folhaNumero = folhaNumMatch[1];
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
    if (/C[oó]digo/i.test(lines[i].text) && /Descri[cç][aã]o/i.test(lines[i].text)) {
      tableHeaderIdx = i;
      break;
    }
  }
  
  const searchEnd = tableHeaderIdx > 0 ? tableHeaderIdx : Math.min(10, lines.length);
  
  for (let i = 2; i < searchEnd; i++) {
    const line = lines[i];
    const items = line.items;
    const text = line.text;
    
    // Strategy: use individual items to find employee data positionally
    // Look for a 3-digit code item, then name items, then 6-digit CBO item
    if (!result.codigo) {
      const codeItem = items.find(it => /^\d{3}$/.test(it.str.trim()));
      if (codeItem) {
        result.codigo = codeItem.str.trim();
        
        // Items after code sorted by X - collect name parts (uppercase text) 
        // and numeric fields (CBO, dept, filial)
        const afterCode = items
          .filter(it => it.x > codeItem.x)
          .sort((a, b) => a.x - b.x);
        
        const nameParts: string[] = [];
        const numericParts: string[] = [];
        
        for (const it of afterCode) {
          const val = it.str.trim();
          if (!val) continue;
          
          if (/^\d+$/.test(val)) {
            numericParts.push(val);
          } else if (/^[A-ZÀ-Ú\s.]+$/.test(val) && val.length >= 2) {
            // Only add to name if we haven't started finding numbers yet
            if (numericParts.length === 0) {
              nameParts.push(val);
            }
          }
        }
        
        if (nameParts.length > 0) {
          result.nome = nameParts.join(' ').trim();
        }
        
        // First 6-digit number is CBO, then dept, then filial
        for (const num of numericParts) {
          if (!result.cbo && num.length === 6) {
            result.cbo = num;
          } else if (result.cbo && !result.departamento) {
            result.departamento = num;
          } else if (result.cbo && result.departamento && !result.filial) {
            result.filial = num;
          }
        }
      }
    }
    
    // Also try regex as fallback for the employee line
    if (!result.codigo) {
      const empMatch = text.match(/\b(\d{3})\s+([A-ZÀ-Ú][A-ZÀ-Ú\s]{3,}?)\s+(\d{6})\b/);
      if (empMatch) {
        result.codigo = empMatch[1];
        result.nome = empMatch[2].trim();
        result.cbo = empMatch[3];
        
        const afterCbo = text.substring(text.indexOf(empMatch[3]) + empMatch[3].length).trim();
        const deptFilMatch = afterCbo.match(/^(\d+)\s+(\d+)/);
        if (deptFilMatch) {
          result.departamento = deptFilMatch[1];
          result.filial = deptFilMatch[2];
        }
      }
    }
    
    // Line with cargo + admissão
    const admMatch = text.match(/Admiss[aã]o[:\s]*(\d{2}\/\d{2}\/\d{4})/i);
    if (admMatch) {
      result.dataAdmissao = admMatch[1];
      const cargoText = text.substring(0, text.search(/Admiss[aã]o/i)).trim();
      if (cargoText) {
        result.cargo = cargoText.replace(/^\d+\s+/, '').trim();
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
} => {
  const eventos: PayslipEvent[] = [];
  let totalVencimentos = '';
  let totalDescontos = '';
  let valorLiquido = '';
  
  // Find table header line
  let headerIdx = -1;
  let vencX: number | null = null;
  let descX: number | null = null;
  let refX: number | null = null;
  
  for (let i = 0; i < lines.length; i++) {
    const text = lines[i].text;
    if (/C[oó]digo/i.test(text) && /Descri[cç][aã]o/i.test(text) && /Vencimentos/i.test(text)) {
      headerIdx = i;
      vencX = findColumnX(lines[i], 'Vencimentos');
      descX = findColumnX(lines[i], 'Descontos');
      refX = findColumnX(lines[i], 'Refer');
      break;
    }
  }
  
  if (headerIdx < 0 || vencX === null || descX === null) {
    return { eventos, totalVencimentos, totalDescontos, valorLiquido };
  }
  
  // Process lines after the header until totals
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    const text = line.text;
    
    // Check for totals - look for the labels and extract values from same line or next line
    if (/Total\s+de\s+Vencimentos/i.test(text)) {
      const vals = line.items.filter(it => /^[\d.,]+$/.test(it.str.trim()) && it.str.trim().includes(','));
      if (vals.length > 0) {
        for (const v of vals) {
          const col = classifyValueColumn(v.x + v.width / 2, vencX!, descX!);
          if (col === 'vencimento') totalVencimentos = v.str.trim();
          else totalDescontos = v.str.trim();
        }
      } else {
        // Values might be on the next line
        const nextLine = i + 1 < lines.length ? lines[i + 1] : null;
        if (nextLine && !/Total|Valor|Sal[aá]rio/i.test(nextLine.text)) {
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
    
    if (/Total\s+de\s+Descontos/i.test(text)) {
      const vals = line.items.filter(it => /^[\d.,]+$/.test(it.str.trim()) && it.str.trim().includes(','));
      if (vals.length > 0) {
        for (const v of vals) {
          totalDescontos = v.str.trim();
        }
      } else {
        // Values might be on the next line
        const nextLine = i + 1 < lines.length ? lines[i + 1] : null;
        if (nextLine && !/Total|Valor|Sal[aá]rio/i.test(nextLine.text)) {
          const nextVals = nextLine.items.filter(it => /^[\d.,]+$/.test(it.str.trim()) && it.str.trim().includes(','));
          if (nextVals.length > 0) totalDescontos = nextVals[nextVals.length - 1].str.trim();
        }
      }
      continue;
    }
    
    if (/Valor\s+L[ií]quido/i.test(text)) {
      const vals = line.items.filter(it => /^[\d.,]+$/.test(it.str.trim()) && it.str.trim().includes(','));
      if (vals.length > 0) {
        valorLiquido = vals[vals.length - 1].str.trim();
      } else {
        // Values might be on the next line
        const nextLine = i + 1 < lines.length ? lines[i + 1] : null;
        if (nextLine) {
          const nextVals = nextLine.items.filter(it => /^[\d.,]+$/.test(it.str.trim()) && it.str.trim().includes(','));
          if (nextVals.length > 0) valorLiquido = nextVals[nextVals.length - 1].str.trim();
        }
      }
      continue;
    }
    
    // Stop at footer labels
    if (/Sal[aá]rio\s+Base/i.test(text) || /Sal\.\s*Contr/i.test(text)) break;
    
    // Parse event line: starts with 3-4 digit code
    const codeItem = line.items.find(it => /^\d{3,4}$/.test(it.str.trim()));
    if (!codeItem) continue;
    
    const codigo = codeItem.str.trim();
    
    // Description: text items after code but before numeric values
    const descItems: string[] = [];
    const numericItems: TextItem[] = [];
    let passedCode = false;
    
    for (const item of line.items) {
      if (item === codeItem) { passedCode = true; continue; }
      if (!passedCode) continue;
      
      const val = item.str.trim();
      if (!val) continue;
      
      // Only consider as numeric if it's purely digits/dots/commas AND positioned
      // in the numeric columns area (after the description zone)
      if (/^[\d.,]+$/.test(val) && val.length >= 2) {
        numericItems.push(item);
      } else if (numericItems.length === 0) {
        // Still in description zone - but skip if it looks like unrelated text
        // from another block (e.g. "Assinatura do Funcionário")
        const itemCenterX = item.x + item.width / 2;
        // Only add to description if it's NOT far to the right (past the discount column)
        if (descX !== null && itemCenterX > descX + 50) {
          // This is text beyond the table columns - ignore it
          continue;
        }
        descItems.push(val);
      } else {
        // Text after numbers - ignore non-numeric text (e.g. "Assinatura do Funcionário")
        if (/^[\d.,]+$/.test(val)) {
          numericItems.push(item);
        }
      }
    }
    
    const descricao = descItems.join(' ').trim();
    if (!descricao) continue;
    
    // Classify numeric values
    let referencia = '';
    let vencimento = '0';
    let desconto = '0';
    
    for (const ni of numericItems) {
      const val = ni.str.trim();
      const centerX = ni.x + ni.width / 2;
      
      // If it's near the reference column
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
  
  return { eventos, totalVencimentos, totalDescontos, valorLiquido };
};

const extractFooter = (lines: LayoutLine[]): {
  salarioBase: string; baseInss: string; baseFgts: string;
  fgtsMes: string; baseIrrf: string; irrf: string;
} => {
  const result = { salarioBase: '', baseInss: '', baseFgts: '', fgtsMes: '', baseIrrf: '', irrf: '' };
  
  // Find line with footer labels
  let labelIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/Sal[aá]rio\s+Base/i.test(lines[i].text) && /Sal\.\s*Contr/i.test(lines[i].text)) {
      labelIdx = i;
      break;
    }
  }
  
  if (labelIdx < 0) {
    // Try single label
    for (let i = 0; i < lines.length; i++) {
      if (/Sal[aá]rio\s+Base/i.test(lines[i].text)) {
        labelIdx = i;
        break;
      }
    }
  }
  
  if (labelIdx < 0) return result;
  
  // The values line is the next line after labels
  // Or values may be on the same line
  const labelLine = lines[labelIdx];
  const nextLine = labelIdx + 1 < lines.length ? lines[labelIdx + 1] : null;
  
  // Collect all numeric values from the values line
  const valueLine = nextLine || labelLine;
  const values = valueLine.items
    .filter(it => /^[\d.,]+$/.test(it.str.trim()) && it.str.trim().includes(','))
    .sort((a, b) => a.x - b.x);
  
  // Map positionally: Salário Base, Base INSS, Base FGTS, FGTS Mês, Base IRRF, Faixa IRRF
  if (values.length >= 1) result.salarioBase = values[0].str.trim();
  if (values.length >= 2) result.baseInss = values[1].str.trim();
  if (values.length >= 3) result.baseFgts = values[2].str.trim();
  if (values.length >= 4) result.fgtsMes = values[3].str.trim();
  if (values.length >= 5) result.baseIrrf = values[4].str.trim();
  if (values.length >= 6) result.irrf = values[5].str.trim();
  
  return result;
};

const extractBankInfo = (lines: LayoutLine[]): { banco: string; agencia: string; contaCorrente: string } => {
  const result = { banco: '', agencia: '', contaCorrente: '' };
  
  // Search all lines for bank info - check multiple patterns
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const text = line.text;
    
    // Look for bank name
    const bankMatch = text.match(/(Ita[uú]|Bradesco|Santander|Caixa|Banco\s+do\s+Brasil|BB|Sicoob|Sicredi|Nu[Bb]ank|Inter|C6)/i);
    if (bankMatch) {
      result.banco = bankMatch[1];
      
      // Agencia and conta on same line
      const agMatch = text.match(/Ag[eê]ncia[:\s]*([\d-]+)/i);
      if (agMatch) result.agencia = agMatch[1].trim();
      
      const contaMatch = text.match(/(?:Conta\s*(?:Corrente)?|CC)[:\s]*([\d.-]+)/i);
      if (contaMatch) result.contaCorrente = contaMatch[1].trim();
      
      // If no explicit labels, try numeric items after bank name
      if (!result.agencia || !result.contaCorrente) {
        const bankItem = line.items.find(it => bankMatch[0] && it.str.toLowerCase().includes(bankMatch[1].toLowerCase()));
        const bankX = bankItem ? bankItem.x + bankItem.width : 0;
        
        const nums = line.items
          .filter(it => /^[\d.-]+$/.test(it.str.trim()) && it.str.trim().length >= 3 && it.x > bankX)
          .sort((a, b) => a.x - b.x);
        if (nums.length >= 2) {
          if (!result.agencia) result.agencia = nums[0].str.trim();
          if (!result.contaCorrente) result.contaCorrente = nums[1].str.trim();
        } else if (nums.length === 1) {
          if (!result.agencia) result.agencia = nums[0].str.trim();
        }
      }
      
      // Also check next line for agencia/conta if not found
      if ((!result.agencia || !result.contaCorrente) && i + 1 < lines.length) {
        const nextText = lines[i + 1].text;
        if (!result.agencia) {
          const agNext = nextText.match(/Ag[eê]ncia[:\s]*([\d-]+)/i);
          if (agNext) result.agencia = agNext[1].trim();
        }
        if (!result.contaCorrente) {
          const contaNext = nextText.match(/(?:Conta\s*(?:Corrente)?|CC)[:\s]*([\d.-]+)/i);
          if (contaNext) result.contaCorrente = contaNext[1].trim();
        }
        // Try positional from next line
        if (!result.agencia || !result.contaCorrente) {
          const nextNums = lines[i + 1].items
            .filter(it => /^[\d.-]+$/.test(it.str.trim()) && it.str.trim().length >= 3)
            .sort((a, b) => a.x - b.x);
          if (nextNums.length >= 2) {
            if (!result.agencia) result.agencia = nextNums[0].str.trim();
            if (!result.contaCorrente) result.contaCorrente = nextNums[1].str.trim();
          }
        }
      }
      
      break;
    }
    
    // Also look for lines with just "Agencia" or "Conta" labels without bank name
    if (!result.agencia) {
      const agOnly = text.match(/Ag[eê]ncia[:\s]*([\d-]+)/i);
      if (agOnly) result.agencia = agOnly[1].trim();
    }
    if (!result.contaCorrente) {
      const contaOnly = text.match(/(?:Conta\s*(?:Corrente)?)[:\s]*([\d.-]+)/i);
      if (contaOnly) result.contaCorrente = contaOnly[1].trim();
    }
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
  const { eventos, totalVencimentos, totalDescontos, valorLiquido } = extractEvents(lines);
  const footer = extractFooter(lines);
  const bank = extractBankInfo(lines);
  
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
      month: header.period,
      fields,
      empresa: header.empresa,
      cnpj: header.cnpj,
      centroCusto: header.centroCusto,
      tipoFolha: header.tipoFolha,
      competencia: header.competencia,
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
