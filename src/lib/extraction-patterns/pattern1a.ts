import { ExtractedMonth, ExtractedField } from '@/types';

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

const extractPeriod = (text: string): string => {
  // Pattern: "Folha Mensal" ... "Marco de 2022"
  const match = text.match(
    /Folha\s+Mensal[\s\S]*?((?:Janeiro|Fevereiro|Mar[cç]o|Abril|Maio|Junho|Julho|Agosto|Setembro|Outubro|Novembro|Dezembro)\s+de\s+\d{4})/i
  );
  if (match) {
    const parts = match[1].trim().split(/\s+de\s+/i);
    if (parts.length === 2) {
      const monthKey = parts[0].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const monthNum = MONTH_NAMES[monthKey] || '??';
      return `${monthNum}/${parts[1]}`;
    }
    return match[1].trim();
  }
  return 'Não identificado';
};

const extractEmployeeName = (text: string): string => {
  // Pattern: 3-digit code + NAME IN CAPS + 6-digit CBO
  const match = text.match(/\b(\d{3})\s+([A-ZÀ-Ú][A-ZÀ-Ú\s]{3,}?)\s+\d{6}\b/);
  return match ? match[2].trim() : '';
};

const extractCNPJ = (text: string): string => {
  const match = text.match(/CNPJ[:\s]*([\d./-]+)/i);
  return match ? match[1].trim() : '';
};

const extractTableItems = (text: string): ExtractedField[] => {
  const fields: ExtractedField[] = [];

  // Match rubric lines: code + description + reference + value
  // The challenge is that pdf.js joins text items with spaces, so we need flexible patterns
  
  // First, try to find all rubric entries with code (3-4 digits) + description + numbers
  const rubricPattern = /\b(\d{3,4})\s+([A-ZÀ-Ú][A-ZÀ-Ú\s.%\/c]{2,}?)\s+([\d.,]+)\s+([\d.,]+)/g;
  let match;
  
  while ((match = rubricPattern.exec(text)) !== null) {
    const description = match[2].trim();
    const referencia = match[3].trim();
    const valor = match[4].trim();
    
    // Skip if description looks like a number sequence (false positive)
    if (/^\d+$/.test(description)) continue;
    
    // Add with reference if it's meaningful
    if (referencia !== '0,00' && referencia !== '0') {
      fields.push({ key: description, value: `${valor} (Ref: ${referencia})` });
    } else {
      fields.push({ key: description, value: valor });
    }
  }

  return fields;
};

const extractTotals = (text: string): ExtractedField[] => {
  const fields: ExtractedField[] = [];
  
  const totalVenc = text.match(/Total\s+de\s+Vencimentos\s+([\d.,]+)/i);
  if (totalVenc) fields.push({ key: 'Total de Vencimentos', value: totalVenc[1] });
  
  const totalDesc = text.match(/Total\s+de\s+Descontos\s+([\d.,]+)/i);
  if (totalDesc) fields.push({ key: 'Total de Descontos', value: totalDesc[1] });
  
  const valorLiq = text.match(/Valor\s+L[ií]quido\s+([\d.,]+)/i);
  if (valorLiq) fields.push({ key: 'Valor Líquido', value: valorLiq[1] });
  
  return fields;
};

const extractFooter = (text: string): ExtractedField[] => {
  const fields: ExtractedField[] = [];
  
  // Footer labels appear in sequence, followed by their values
  // "Salario Base Sal. Contr. INSS Base Calc. FGTS F.G.T.S do Mes Base Calc. IRRF Faixa IRRF"
  // Then 6 numbers follow
  const footerMatch = text.match(
    /Faixa\s+IRRF\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)/i
  );
  
  if (footerMatch) {
    fields.push({ key: 'Salário Base', value: footerMatch[1] });
    fields.push({ key: 'Sal. Contr. INSS', value: footerMatch[2] });
    fields.push({ key: 'Base Calc. FGTS', value: footerMatch[3] });
    fields.push({ key: 'F.G.T.S do Mês', value: footerMatch[4] });
    fields.push({ key: 'Base Calc. IRRF', value: footerMatch[5] });
    fields.push({ key: 'Faixa IRRF', value: footerMatch[6] });
    return fields;
  }

  // Alternative: try to find individual footer fields
  const salBase = text.match(/Sal[aá]rio\s+Base\s+([\d.,]+)/i);
  if (salBase) fields.push({ key: 'Salário Base', value: salBase[1] });

  const salInss = text.match(/Sal\.\s*Contr\.\s*INSS\s+([\d.,]+)/i);
  if (salInss) fields.push({ key: 'Sal. Contr. INSS', value: salInss[1] });

  const baseFgts = text.match(/Base\s+Calc\.\s*FGTS\s+([\d.,]+)/i);
  if (baseFgts) fields.push({ key: 'Base Calc. FGTS', value: baseFgts[1] });

  const fgtsMes = text.match(/F\.?G\.?T\.?S\.?\s+do\s+M[eê]s\s+([\d.,]+)/i);
  if (fgtsMes) fields.push({ key: 'F.G.T.S do Mês', value: fgtsMes[1] });

  const baseIrrf = text.match(/Base\s+Calc\.\s*IRRF\s+([\d.,]+)/i);
  if (baseIrrf) fields.push({ key: 'Base Calc. IRRF', value: baseIrrf[1] });

  const faixaIrrf = text.match(/Faixa\s+IRRF\s+([\d.,]+)/i);
  if (faixaIrrf) fields.push({ key: 'Faixa IRRF', value: faixaIrrf[1] });

  return fields;
};

/**
 * Extract data from a single page of a "1a" pattern payslip
 */
export const extractPattern1aPage = (text: string): { month: ExtractedMonth; employeeName: string; cnpj: string } => {
  const period = extractPeriod(text);
  const employeeName = extractEmployeeName(text);
  const cnpj = extractCNPJ(text);
  
  const tableFields = extractTableItems(text);
  const totalFields = extractTotals(text);
  const footerFields = extractFooter(text);
  
  const allFields = [...tableFields, ...totalFields, ...footerFields];
  
  return {
    month: { month: period, fields: allFields },
    employeeName,
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
