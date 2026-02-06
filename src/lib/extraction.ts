import * as pdfjsLib from 'pdfjs-dist';
import Tesseract from 'tesseract.js';
import { ExtractedData, ExtractedMonth, ExtractedField } from '@/types';

// Configure PDF.js worker - use unpkg CDN which has all versions
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

// Regex patterns for payslip data extraction
const patterns = {
  name: /(?:nome|funcionário|empregado)[:\s]*([A-ZÀ-Ú\s]+)/i,
  cnpj: /(?:CNPJ)[:\s]*([\d./-]+)/i,
  cpf: /(?:CPF)[:\s]*([\d./-]+)/i,
  month: /(?:competência|referência|mês|período)[:\s]*(\d{2}\/\d{4}|\w+\/\d{4}|\d{2}-\d{4})/i,
  salaryBase: /(?:salário\s*base|sal\.\s*base|salario)[:\s]*([\d.,]+)/i,
  grossTotal: /(?:total\s*(?:de\s*)?vencimentos|bruto|total\s*proventos)[:\s]*([\d.,]+)/i,
  netTotal: /(?:líquido|valor\s*líquido|total\s*líquido)[:\s]*([\d.,]+)/i,
  inss: /(?:INSS|contribuição\s*previdenciária)[:\s]*([\d.,]+)/i,
  irrf: /(?:IRRF|imposto\s*de\s*renda)[:\s]*([\d.,]+)/i,
  fgts: /(?:FGTS|fundo\s*de\s*garantia)[:\s]*([\d.,]+)/i,
  discounts: /(?:total\s*(?:de\s*)?descontos|descontos)[:\s]*([\d.,]+)/i,
};

// Extract key-value pairs from text using patterns
const extractFieldsFromText = (text: string): ExtractedField[] => {
  const fields: ExtractedField[] = [];
  
  // Common payslip fields to look for
  const fieldPatterns: { key: string; pattern: RegExp }[] = [
    { key: 'Salário Base', pattern: /(?:salário\s*base|sal\.\s*base)[:\s]*([\d.,]+)/i },
    { key: 'Horas Extras', pattern: /(?:horas?\s*extras?|h\.?\s*extras?)[:\s]*([\d.,]+)/i },
    { key: 'Adicional Noturno', pattern: /(?:adic(?:ional)?\s*noturno)[:\s]*([\d.,]+)/i },
    { key: 'Insalubridade', pattern: /(?:insalubridade)[:\s]*([\d.,]+)/i },
    { key: 'Periculosidade', pattern: /(?:periculosidade)[:\s]*([\d.,]+)/i },
    { key: 'Vale Transporte', pattern: /(?:vale\s*transporte|v\.?\s*transporte)[:\s]*([\d.,]+)/i },
    { key: 'Vale Refeição', pattern: /(?:vale\s*refeição|v\.?\s*refeição|vr)[:\s]*([\d.,]+)/i },
    { key: 'Plano de Saúde', pattern: /(?:plano\s*(?:de\s*)?saúde|assistência\s*médica)[:\s]*([\d.,]+)/i },
    { key: 'INSS', pattern: /(?:INSS|contribuição\s*previdenciária)[:\s]*([\d.,]+)/i },
    { key: 'IRRF', pattern: /(?:IRRF|imposto\s*de\s*renda|IR)[:\s]*([\d.,]+)/i },
    { key: 'FGTS', pattern: /(?:FGTS|fundo\s*de\s*garantia)[:\s]*([\d.,]+)/i },
    { key: 'Total Vencimentos', pattern: /(?:total\s*(?:de\s*)?vencimentos|bruto|total\s*proventos)[:\s]*([\d.,]+)/i },
    { key: 'Total Descontos', pattern: /(?:total\s*(?:de\s*)?descontos)[:\s]*([\d.,]+)/i },
    { key: 'Valor Líquido', pattern: /(?:líquido|valor\s*líquido|total\s*líquido)[:\s]*([\d.,]+)/i },
    { key: 'Base INSS', pattern: /(?:base\s*INSS)[:\s]*([\d.,]+)/i },
    { key: 'Base FGTS', pattern: /(?:base\s*FGTS)[:\s]*([\d.,]+)/i },
    { key: 'Base IRRF', pattern: /(?:base\s*IR(?:RF)?)[:\s]*([\d.,]+)/i },
    { key: 'Férias', pattern: /(?:férias)[:\s]*([\d.,]+)/i },
    { key: '13º Salário', pattern: /(?:13º?\s*salário|décimo\s*terceiro)[:\s]*([\d.,]+)/i },
  ];
  
  // Try to extract each field
  fieldPatterns.forEach(({ key, pattern }) => {
    const match = text.match(pattern);
    if (match && match[1]) {
      fields.push({ key, value: match[1].trim() });
    }
  });
  
  // Also try to extract tabular data (rubric code, description, value pattern)
  const tablePattern = /(\d{3,4})\s+([A-ZÀ-Ú\s.]+)\s+([\d.,]+)/gi;
  let tableMatch;
  while ((tableMatch = tablePattern.exec(text)) !== null) {
    const description = tableMatch[2].trim();
    const value = tableMatch[3].trim();
    if (description && value && !fields.some(f => f.key === description)) {
      fields.push({ key: description, value });
    }
  }
  
  return fields;
};

// Detect document type based on content
const detectDocumentType = (text: string): ExtractedData['documentType'] => {
  const lowerText = text.toLowerCase();
  
  if (lowerText.includes('rescisão') || lowerText.includes('termo de rescisão')) {
    return 'termo_rescisao';
  }
  
  // Check for multiple months (annual report)
  const monthPattern = /(?:jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez|\d{2})[\/-]\d{4}/gi;
  const months = text.match(monthPattern);
  
  if (months && months.length > 2) {
    return 'relatorio_anual';
  }
  
  return 'holerite_normal';
};

// Extract employee name
const extractEmployeeName = (text: string): string => {
  const match = text.match(patterns.name);
  return match ? match[1].trim() : '';
};

// Extract CNPJ
const extractCNPJ = (text: string): string => {
  const match = text.match(patterns.cnpj);
  return match ? match[1].trim() : '';
};

// Extract month/period
const extractMonth = (text: string): string => {
  const match = text.match(patterns.month);
  if (match) {
    return match[1].trim();
  }
  
  // Try to find any month pattern
  const monthPattern = /(?:jan(?:eiro)?|fev(?:ereiro)?|mar(?:ço)?|abr(?:il)?|mai(?:o)?|jun(?:ho)?|jul(?:ho)?|ago(?:sto)?|set(?:embro)?|out(?:ubro)?|nov(?:embro)?|dez(?:embro)?)[\/\-]?\s*\d{4}/i;
  const monthMatch = text.match(monthPattern);
  return monthMatch ? monthMatch[0].trim() : 'Não identificado';
};

// PDF Text Extraction
export const extractDataFromPDF = async (base64Data: string): Promise<ExtractedData> => {
  const months: ExtractedMonth[] = [];
  let employeeName = '';
  let cnpj = '';
  let documentType: ExtractedData['documentType'] = 'holerite_normal';
  
  try {
    // Convert base64 to array buffer
    const pdfData = base64Data.split(',')[1];
    const binaryString = atob(pdfData);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    // Load PDF
    const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
    const numPages = pdf.numPages;
    
    // Extract text from each page
    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      const text = textContent.items
        .map((item: any) => item.str)
        .join(' ');
      
      // First page - extract header info
      if (pageNum === 1) {
        employeeName = extractEmployeeName(text);
        cnpj = extractCNPJ(text);
        documentType = detectDocumentType(text);
      }
      
      // Extract fields for this page
      const fields = extractFieldsFromText(text);
      const month = extractMonth(text);
      
      if (fields.length > 0) {
        months.push({ month, fields });
      }
    }
    
    // If no text was found, it might be a scanned PDF - try OCR
    if (months.length === 0 || months.every(m => m.fields.length === 0)) {
      return extractDataFromImage(base64Data);
    }
    
  } catch (error) {
    console.error('PDF extraction error:', error);
    throw error;
  }
  
  return {
    employeeName,
    cnpj,
    documentType,
    months,
    extractedAt: new Date().toISOString(),
  };
};

// Image OCR Extraction
export const extractDataFromImage = async (base64Data: string): Promise<ExtractedData> => {
  const months: ExtractedMonth[] = [];
  let employeeName = '';
  let cnpj = '';
  
  try {
    const result = await Tesseract.recognize(base64Data, 'por', {
      logger: (m) => console.log('OCR:', m.status, m.progress),
    });
    
    const text = result.data.text;
    
    employeeName = extractEmployeeName(text);
    cnpj = extractCNPJ(text);
    
    const fields = extractFieldsFromText(text);
    const month = extractMonth(text);
    
    if (fields.length > 0) {
      months.push({ month, fields });
    }
    
  } catch (error) {
    console.error('OCR extraction error:', error);
    throw error;
  }
  
  return {
    employeeName,
    cnpj,
    documentType: 'holerite_imagem',
    months,
    extractedAt: new Date().toISOString(),
  };
};
