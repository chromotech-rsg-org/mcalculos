import * as pdfjsLib from 'pdfjs-dist';
import Tesseract from 'tesseract.js';
import { ExtractedData, ExtractedMonth, ExtractedField } from '@/types';
import { detectPayslipPattern, extractPattern1a, extractTextItems, flattenItems } from '@/lib/extraction-patterns';
import type { TextItem } from '@/lib/extraction-patterns';

// Configure PDF.js worker - use unpkg CDN which has all versions
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

// ============================================================
// Generic extraction (fallback for unrecognized patterns)
// ============================================================

const extractFieldsFromText = (text: string): ExtractedField[] => {
  const fields: ExtractedField[] = [];
  
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
  
  fieldPatterns.forEach(({ key, pattern }) => {
    const match = text.match(pattern);
    if (match && match[1]) {
      fields.push({ key, value: match[1].trim() });
    }
  });
  
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

const detectDocumentType = (text: string): ExtractedData['documentType'] => {
  const lowerText = text.toLowerCase();
  
  if (lowerText.includes('rescisão') || lowerText.includes('termo de rescisão')) {
    return 'termo_rescisao';
  }
  
  const monthPattern = /(?:jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez|\d{2})[\/-]\d{4}/gi;
  const months = text.match(monthPattern);
  
  if (months && months.length > 2) {
    return 'relatorio_anual';
  }
  
  return 'holerite_normal';
};

const extractEmployeeName = (text: string): string => {
  const match = text.match(/(?:nome|funcionário|empregado)[:\s]*([A-ZÀ-Ú\s]+)/i);
  return match ? match[1].trim() : '';
};

const extractCNPJ = (text: string): string => {
  const match = text.match(/(?:CNPJ)[:\s]*([\d./-]+)/i);
  return match ? match[1].trim() : '';
};

const extractMonth = (text: string): string => {
  const match = text.match(/(?:competência|referência|mês|período)[:\s]*(\d{2}\/\d{4}|\w+\/\d{4}|\d{2}-\d{4})/i);
  if (match) return match[1].trim();
  
  const monthPattern = /(?:jan(?:eiro)?|fev(?:ereiro)?|mar(?:ço)?|abr(?:il)?|mai(?:o)?|jun(?:ho)?|jul(?:ho)?|ago(?:sto)?|set(?:embro)?|out(?:ubro)?|nov(?:embro)?|dez(?:embro)?)[\/\-]?\s*\d{4}/i;
  const monthMatch = text.match(monthPattern);
  return monthMatch ? monthMatch[0].trim() : 'Não identificado';
};

// ============================================================
// PDF Text Extraction (routes to pattern or generic)
// ============================================================

export const extractDataFromPDF = async (base64Data: string, forcedPattern?: string): Promise<ExtractedData> => {
  try {
    // Convert base64 to array buffer
    const pdfData = base64Data.split(',')[1];
    const binaryString = atob(pdfData);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    // Load PDF and extract text items with coordinates from all pages
    const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
    const numPages = pdf.numPages;
    const pageItems: TextItem[][] = [];
    const pageTexts: string[] = [];
    
    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const items = await extractTextItems(page);
      pageItems.push(items);
      pageTexts.push(flattenItems(items));
    }
    
    // Detect or use forced pattern
    const pattern = forcedPattern && forcedPattern !== 'auto'
      ? forcedPattern
      : detectPayslipPattern(pageTexts[0] || '');
    
    // Route to pattern-specific extractor (uses positional items)
    if (pattern === '1a') {
      const result = extractPattern1a(pageItems);
      
      if (result.months.length === 0 || result.months.every(m => m.fields.length === 0)) {
        return extractDataFromImage(base64Data);
      }
      
      return {
        employeeName: result.employeeName,
        cnpj: result.cnpj,
        documentType: 'holerite_normal',
        payslipPattern: '1a',
        months: result.months,
        extractedAt: new Date().toISOString(),
      };
    }
    
    // Generic extraction (fallback) - uses flat text
    const months: ExtractedMonth[] = [];
    let employeeName = '';
    let cnpj = '';
    let documentType: ExtractedData['documentType'] = 'holerite_normal';
    
    for (let i = 0; i < pageTexts.length; i++) {
      const text = pageTexts[i];
      
      if (i === 0) {
        employeeName = extractEmployeeName(text);
        cnpj = extractCNPJ(text);
        documentType = detectDocumentType(text);
      }
      
      const fields = extractFieldsFromText(text);
      const month = extractMonth(text);
      
      if (fields.length > 0) {
        months.push({ month, fields });
      }
    }
    
    if (months.length === 0 || months.every(m => m.fields.length === 0)) {
      return extractDataFromImage(base64Data);
    }
    
    return {
      employeeName,
      cnpj,
      documentType,
      payslipPattern: pattern !== 'generic' ? pattern : undefined,
      months,
      extractedAt: new Date().toISOString(),
    };
    
  } catch (error) {
    console.error('PDF extraction error:', error);
    throw error;
  }
};

// ============================================================
// Image OCR Extraction
// ============================================================

/**
 * Render a PDF page to a canvas and return a base64 PNG data URL.
 */
const renderPdfPageToImage = async (base64Data: string, pageNum: number, scale = 2): Promise<string> => {
  const pdfData = base64Data.split(',')[1] || base64Data;
  const binaryString = atob(pdfData);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
  const page = await pdf.getPage(pageNum);
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext('2d')!;

  await page.render({ canvasContext: ctx, viewport }).promise;
  const dataUrl = canvas.toDataURL('image/png');
  canvas.remove();
  return dataUrl;
};

/**
 * Check if a base64 string represents a PDF file.
 */
const isPdfBase64 = (base64Data: string): boolean => {
  return base64Data.startsWith('data:application/pdf') || 
    (base64Data.includes('JVBERi') || base64Data.startsWith('JVBER')); // %PDF magic bytes in base64
};

export const extractDataFromImage = async (base64Data: string): Promise<ExtractedData> => {
  const months: ExtractedMonth[] = [];
  let employeeName = '';
  let cnpj = '';
  
  try {
    // If input is a PDF, render pages to images first
    if (isPdfBase64(base64Data)) {
      console.log('Input is PDF - rendering pages to images for OCR...');
      const pdfData = base64Data.split(',')[1] || base64Data;
      const binaryString = atob(pdfData);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
      const numPages = pdf.numPages;

      for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        console.log(`OCR: rendering page ${pageNum}/${numPages}`);
        const pageImage = await renderPdfPageToImage(base64Data, pageNum);
        
        const result = await Tesseract.recognize(pageImage, 'por', {
          logger: (m) => console.log(`OCR page ${pageNum}:`, m.status, m.progress),
        });
        
        const text = result.data.text;
        
        if (pageNum === 1) {
          employeeName = extractEmployeeName(text);
          cnpj = extractCNPJ(text);
        }
        
        const fields = extractFieldsFromText(text);
        const month = extractMonth(text);
        
        if (fields.length > 0) {
          months.push({ month, fields });
        }
      }
    } else {
      // Regular image
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
