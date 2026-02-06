import * as XLSX from 'xlsx';
import { ExtractedData } from '@/types';

export const exportToExcel = (data: ExtractedData, filename: string): void => {
  // Prepare data for Excel
  const rows: Record<string, string>[] = [];
  
  data.months.forEach(month => {
    const row: Record<string, string> = { Período: month.month };
    month.fields.forEach(field => {
      row[field.key] = field.value;
    });
    rows.push(row);
  });
  
  // Create workbook and worksheet
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  
  // Add header info as a separate sheet
  const infoSheet = XLSX.utils.aoa_to_sheet([
    ['Funcionário', data.employeeName],
    ['CNPJ', data.cnpj],
    ['Extraído em', new Date(data.extractedAt).toLocaleString('pt-BR')],
  ]);
  
  XLSX.utils.book_append_sheet(workbook, infoSheet, 'Informações');
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Dados');
  
  // Auto-size columns
  const maxWidths: number[] = [];
  rows.forEach(row => {
    Object.keys(row).forEach((key, i) => {
      const len = Math.max(key.length, (row[key] || '').toString().length);
      maxWidths[i] = Math.max(maxWidths[i] || 0, len);
    });
  });
  worksheet['!cols'] = maxWidths.map(w => ({ wch: Math.min(w + 2, 50) }));
  
  // Save file
  XLSX.writeFile(workbook, `${filename}.xlsx`);
};

export const exportToCSV = (data: ExtractedData, filename: string): void => {
  // Get all unique field keys
  const allKeys = new Set<string>();
  data.months.forEach(month => {
    month.fields.forEach(field => allKeys.add(field.key));
  });
  
  const headers = ['Período', ...Array.from(allKeys)];
  
  // Build CSV rows
  const rows: string[][] = [headers];
  
  data.months.forEach(month => {
    const row: string[] = [month.month];
    Array.from(allKeys).forEach(key => {
      const field = month.fields.find(f => f.key === key);
      row.push(field?.value || '');
    });
    rows.push(row);
  });
  
  // Convert to CSV string
  const csvContent = rows
    .map(row => row.map(cell => `"${(cell || '').replace(/"/g, '""')}"`).join(','))
    .join('\n');
  
  // Create and download file
  const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${filename}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
};
