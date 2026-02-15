import { ExtractedMonth, PayslipEvent } from '@/types';

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

const extractPeriod = (text: string): { period: string; competencia: string; tipoFolha: string } => {
  // Match "Folha Mensal" or similar type
  const tipoMatch = text.match(/Folha\s+(Mensal|Complementar|[A-Za-zÀ-ú]+)/i);
  const tipoFolha = tipoMatch ? tipoMatch[0].trim() : 'Mensalista';

  // Match month/year: "Marco de 2022"
  const match = text.match(
    /(?:Folha\s+\w+[\s\S]*?)?(?:Mensalista|Horista|Quinzenalista)?\s*((?:Janeiro|Fevereiro|Mar[cç]o|Abril|Maio|Junho|Julho|Agosto|Setembro|Outubro|Novembro|Dezembro)\s+de\s+\d{4})/i
  );
  if (match) {
    const parts = match[1].trim().split(/\s+de\s+/i);
    if (parts.length === 2) {
      const monthKey = parts[0].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const monthNum = MONTH_NAMES[monthKey] || '??';
      const label = MONTH_LABELS[monthKey] || parts[0];
      return {
        period: `${monthNum}/${parts[1]}`,
        competencia: `${label} de ${parts[1]}`,
        tipoFolha,
      };
    }
    return { period: match[1].trim(), competencia: match[1].trim(), tipoFolha };
  }
  return { period: 'Não identificado', competencia: 'Não identificado', tipoFolha };
};

const extractEmployeeInfo = (text: string): {
  codigo: string; nome: string; cbo: string; departamento: string; filial: string;
} => {
  // Pattern: 3-digit code + NAME IN CAPS + 6-digit CBO + dept + filial
  const match = text.match(/\b(\d{3})\s+([A-ZÀ-Ú][A-ZÀ-Ú\s]{3,}?)\s+(\d{6})\s+(\d+)\s+(\d+)\b/);
  if (match) {
    return {
      codigo: match[1],
      nome: match[2].trim(),
      cbo: match[3],
      departamento: match[4],
      filial: match[5],
    };
  }
  // Fallback: just name
  const nameMatch = text.match(/\b(\d{3})\s+([A-ZÀ-Ú][A-ZÀ-Ú\s]{3,}?)\s+\d{6}\b/);
  return {
    codigo: nameMatch ? nameMatch[1] : '',
    nome: nameMatch ? nameMatch[2].trim() : '',
    cbo: '', departamento: '', filial: '',
  };
};

const extractCargo = (text: string): string => {
  // Cargo appears after employee line, before "Admissao"
  const match = text.match(/\d{6}\s+\d+\s+\d+\s+([A-ZÀ-Ú][A-ZÀ-Ú\s.]+?)\s+Admiss/i);
  return match ? match[1].trim() : '';
};

const extractDataAdmissao = (text: string): string => {
  const match = text.match(/Admiss[aã]o[:\s]*(\d{2}\/\d{2}\/\d{4})/i);
  return match ? match[1] : '';
};

const extractEmpresaName = (text: string): string => {
  // Take text before CNPJ
  const match = text.match(/^([\s\S]*?)CNPJ/i);
  if (match) {
    // Clean up - take the last meaningful line before CNPJ
    const parts = match[1].trim().split(/\s{3,}/);
    return parts[parts.length - 1]?.trim() || match[1].trim().substring(0, 80);
  }
  return '';
};

const extractCNPJ = (text: string): string => {
  const match = text.match(/CNPJ[:\s]*([\d./-]+)/i);
  return match ? match[1].trim() : '';
};

const extractCentroCusto = (text: string): string => {
  const match = text.match(/CC[:\s]*([A-ZÀ-Úa-zà-ú\s]+?)(?:\s+Folha|\s+\d)/i);
  return match ? match[1].trim() : '';
};

const extractFolhaNumero = (text: string): string => {
  const match = text.match(/Folha\s+(?:Mensal|Complementar|\w+)\s+.*?\b(\d{2,4})\s+\d{3}\s+[A-Z]/i);
  // Try another pattern: look for a number between tipo folha info and employee code
  const match2 = text.match(/Mensalista\s+.*?(?:de\s+\d{4})\s+(\d{2,4})\s+\d{3}/i);
  return match ? match[1] : (match2 ? match2[1] : '');
};

const extractTableEvents = (text: string): PayslipEvent[] => {
  const events: PayslipEvent[] = [];

  // Match rubric lines: code (3-4 digits) + description + reference + value(s)
  const rubricPattern = /\b(\d{3,4})\s+([A-ZÀ-Ú][A-ZÀ-Ú\s.%\/c]{2,}?)\s+([\d.,]+)\s+([\d.,]+)/g;
  let match;
  
  while ((match = rubricPattern.exec(text)) !== null) {
    const codigo = match[1];
    const descricao = match[2].trim();
    const referencia = match[3].trim();
    const valor = match[4].trim();
    
    if (/^\d+$/.test(descricao)) continue;
    
    // Determine if it's vencimento or desconto based on context
    // For now, check if there's a 5th capture (second value = desconto)
    // We'll also check for a trailing value
    const afterMatch = text.substring(match.index + match[0].length).match(/^\s+([\d.,]+)/);
    
    if (afterMatch) {
      // Has two values: vencimento + desconto
      events.push({
        codigo,
        descricao,
        referencia,
        vencimento: valor,
        desconto: afterMatch[1],
      });
    } else {
      // Single value - need to determine if vencimento or desconto
      // Heuristic: common discount codes
      const isDesconto = ['998', '871', '981', '217', '783', '784', '999'].includes(codigo) ||
        descricao.toLowerCase().includes('desconto') ||
        descricao.toLowerCase().includes('i.n.s.s') ||
        descricao.toLowerCase().includes('vale transporte');
      
      events.push({
        codigo,
        descricao,
        referencia,
        vencimento: isDesconto ? '0' : valor,
        desconto: isDesconto ? valor : '0',
      });
    }
  }

  return events;
};

const extractTotals = (text: string): {
  totalVencimentos: string; totalDescontos: string; valorLiquido: string;
} => {
  const totalVenc = text.match(/Total\s+de\s+Vencimentos\s+([\d.,]+)/i);
  const totalDesc = text.match(/Total\s+de\s+Descontos\s+([\d.,]+)/i);
  const valorLiq = text.match(/Valor\s+L[ií]quido\s+([\d.,]+)/i);
  
  return {
    totalVencimentos: totalVenc ? totalVenc[1] : '',
    totalDescontos: totalDesc ? totalDesc[1] : '',
    valorLiquido: valorLiq ? valorLiq[1] : '',
  };
};

const extractFooter = (text: string): {
  salarioBase: string; baseInss: string; baseFgts: string;
  fgtsMes: string; baseIrrf: string; irrf: string;
} => {
  const result = { salarioBase: '', baseInss: '', baseFgts: '', fgtsMes: '', baseIrrf: '', irrf: '' };
  
  const footerMatch = text.match(
    /Faixa\s+IRRF\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)/i
  );
  
  if (footerMatch) {
    result.salarioBase = footerMatch[1];
    result.baseInss = footerMatch[2];
    result.baseFgts = footerMatch[3];
    result.fgtsMes = footerMatch[4];
    result.baseIrrf = footerMatch[5];
    result.irrf = footerMatch[6];
    return result;
  }

  // Individual fallbacks
  const salBase = text.match(/Sal[aá]rio\s+Base\s+([\d.,]+)/i);
  if (salBase) result.salarioBase = salBase[1];
  const salInss = text.match(/Sal\.\s*Contr\.\s*INSS\s+([\d.,]+)/i);
  if (salInss) result.baseInss = salInss[1];
  const baseFgts = text.match(/Base\s+Calc\.\s*FGTS\s+([\d.,]+)/i);
  if (baseFgts) result.baseFgts = baseFgts[1];
  const fgtsMes = text.match(/F\.?G\.?T\.?S\.?\s+do\s+M[eê]s\s+([\d.,]+)/i);
  if (fgtsMes) result.fgtsMes = fgtsMes[1];
  const baseIrrf = text.match(/Base\s+Calc\.\s*IRRF\s+([\d.,]+)/i);
  if (baseIrrf) result.baseIrrf = baseIrrf[1];
  const faixaIrrf = text.match(/Faixa\s+IRRF\s+([\d.,]+)/i);
  if (faixaIrrf) result.irrf = faixaIrrf[1];

  return result;
};

const extractBankInfo = (text: string): { banco: string; agencia: string; contaCorrente: string } => {
  // Pattern: bank name + agency number + account number near end
  const match = text.match(/(Ita[uú]|Bradesco|Santander|Caixa|Banco\s+do\s+Brasil|BB|Sicoob|Sicredi|Nu[Bb]ank|Inter|C6)\s+(\d{3,5})\s+([\d.-]+)/i);
  if (match) {
    return { banco: match[1], agencia: match[2], contaCorrente: match[3] };
  }
  return { banco: '', agencia: '', contaCorrente: '' };
};

/**
 * Extract data from a single page of a "1a" pattern payslip
 */
export const extractPattern1aPage = (text: string): { month: ExtractedMonth; employeeName: string; cnpj: string } => {
  const { period, competencia, tipoFolha } = extractPeriod(text);
  const empInfo = extractEmployeeInfo(text);
  const cnpj = extractCNPJ(text);
  const empresa = extractEmpresaName(text);
  const centroCusto = extractCentroCusto(text);
  const folhaNumero = extractFolhaNumero(text);
  const cargo = extractCargo(text);
  const dataAdmissao = extractDataAdmissao(text);
  const eventos = extractTableEvents(text);
  const totals = extractTotals(text);
  const footer = extractFooter(text);
  const bank = extractBankInfo(text);

  // Build legacy fields for backward compatibility
  const fields = eventos.map(e => ({
    key: e.descricao,
    value: e.vencimento !== '0' ? e.vencimento : e.desconto,
  }));
  if (totals.totalVencimentos) fields.push({ key: 'Total de Vencimentos', value: totals.totalVencimentos });
  if (totals.totalDescontos) fields.push({ key: 'Total de Descontos', value: totals.totalDescontos });
  if (totals.valorLiquido) fields.push({ key: 'Valor Líquido', value: totals.valorLiquido });
  if (footer.salarioBase) fields.push({ key: 'Salário Base', value: footer.salarioBase });

  return {
    month: {
      month: period,
      fields,
      empresa,
      cnpj,
      centroCusto,
      tipoFolha,
      competencia,
      folhaNumero,
      codigoFuncionario: empInfo.codigo,
      nomeFuncionario: empInfo.nome,
      cbo: empInfo.cbo,
      departamento: empInfo.departamento,
      filial: empInfo.filial,
      cargo,
      dataAdmissao,
      eventos,
      ...totals,
      ...footer,
      ...bank,
    },
    employeeName: empInfo.nome,
    cnpj,
  };
};

/**
 * Extract all pages from a "1a" pattern payslip PDF
 */
export const extractPattern1a = (pages: string[]): Pattern1aResult => {
  let employeeName = '';
  let cnpj = '';
  const months: ExtractedMonth[] = [];
  
  for (const pageText of pages) {
    const result = extractPattern1aPage(pageText);
    
    if (result.employeeName && !employeeName) employeeName = result.employeeName;
    if (result.cnpj && !cnpj) cnpj = result.cnpj;
    
    if (result.month.fields.length > 0) {
      months.push(result.month);
    }
  }
  
  return { employeeName, cnpj, months };
};
