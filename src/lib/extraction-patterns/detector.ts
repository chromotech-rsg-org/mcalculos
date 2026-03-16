/**
 * Auto-detect payslip pattern from extracted text
 */
export const detectPayslipPattern = (text: string): string => {
  // Pattern 1a: Brazilian payslip with table structure (Vencimentos/Descontos)
  // Broadened detection to cover SEMAR, Keypar, and other variations
  const hasTableStructure = (/Vencimento(?:s)?/i.test(text) || /Proventos?/i.test(text)) && /Desconto(?:s)?/i.test(text);
  const hasPayslipIndicators = (
    /Folha\s+(Mensal|Complementar|Pagamento)/i.test(text) ||
    /Sal[aá]rio\s+(Base|Fixo)/i.test(text) ||
    /Sal\.\s*Contr/i.test(text) ||
    /Base\s+(INSS|FGTS|para\s+FGTS)/i.test(text) ||
    /Valor\s+L[ií]quido/i.test(text) ||
    /L[ií]quido\s+a\s+Receber/i.test(text) ||
    /Total\s+de\s+(Vencimentos|Proventos)/i.test(text) ||
    /Compet[eê]ncia/i.test(text) ||
    /Admiss[aã]o/i.test(text) ||
    /Demonstrativo\s+de\s+Pagamento/i.test(text) ||
    /Discrimina[cç][aã]o/i.test(text)
  );
  
  if (hasTableStructure && hasPayslipIndicators) return '1a';
  
  // Even without "Folha Mensal", if we see table headers + CNPJ it's likely 1a
  if (hasTableStructure && /CNPJ/i.test(text)) return '1a';
  
  // Future patterns: 2a, 3a, etc. will be added here
  
  return 'generic';
};
