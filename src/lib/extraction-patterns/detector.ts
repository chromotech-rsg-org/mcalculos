/**
 * Auto-detect payslip pattern from extracted text
 */
export const detectPayslipPattern = (text: string): string => {
  // Pattern 1a: "Folha Mensal" + specific table structure
  const has1a = (
    /Folha\s+Mensal/i.test(text) &&
    /Vencimentos/i.test(text) &&
    /Descontos/i.test(text) &&
    /Sal[aá]rio\s+Base/i.test(text)
  );
  
  if (has1a) return '1a';
  
  // Future patterns: 2a, 3a, etc. will be added here
  
  return 'generic';
};
