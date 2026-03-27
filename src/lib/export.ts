import * as XLSX from 'xlsx';
import { ExtractedData, PayslipEvent, TabData } from '@/types';
import { buildTabsFromMonths } from '@/lib/build-tabs';

/** Rebuild tabs from months data to reflect user edits (deletions, changes) */
const rebuildLiveTabs = (data: ExtractedData): Record<string, TabData> | null => {
  if (!data.months || data.months.length === 0) return null;
  const hasEvents = data.months.some(m => m.eventos && m.eventos.length > 0);
  if (!hasEvents) return null;
  const tabs = buildTabsFromMonths(data.months, ['vencimentos', 'descontos', 'quantidade']);
  return Object.keys(tabs).length > 0 ? tabs : null;
};

/**
 * Determine the max number of events across all months
 */
const getMaxEvents = (data: ExtractedData): number => {
  let max = 0;
  for (const month of data.months) {
    const count = (month.eventos || []).length;
    if (count > max) max = count;
  }
  return Math.max(max, 1);
};

/**
 * Collect all unique field keys across all months, preserving first-appearance order.
 */
const collectFieldKeys = (data: ExtractedData): string[] => {
  const keys: string[] = [];
  const seen = new Set<string>();
  for (const month of data.months) {
    for (const field of (month.fields || [])) {
      const k = field.key;
      if (!seen.has(k)) {
        seen.add(k);
        keys.push(k);
      }
    }
  }
  return keys;
};

/**
 * Get a field value from month.fields[] by key
 */
const getFieldValue = (month: any, key: string): string => {
  const field = (month.fields || []).find((f: any) => f.key === key);
  return field?.value || '';
};

/**
 * Build a single row per month using dynamic fields from fields[]
 */
const buildExcelRows = (data: ExtractedData, fieldKeys: string[], maxEvents: number): Record<string, string>[] => {
  return data.months.map(month => {
    const row: Record<string, string> = {};

    // Dynamic fields from fields[]
    for (const key of fieldKeys) {
      row[key] = getFieldValue(month, key);
    }

    // Event lines
    const eventos = month.eventos || [];
    for (let i = 0; i < maxEvents; i++) {
      const n = i + 1;
      const ev: PayslipEvent | undefined = eventos[i];
      row[`Código Evento linha ${n}`] = ev?.codigo || '';
      row[`Descrição Evento linha ${n}`] = ev?.descricao || '';
      row[`Referência linha ${n}`] = ev?.referencia || '';
      row[`Valor Vencimento linha ${n}`] = ev?.vencimento || '';
      row[`Valor Desconto linha ${n}`] = ev?.desconto || '';
    }

    return row;
  });
};

/**
 * Build headers: dynamic field keys first, then event columns
 */
const getOrderedHeaders = (fieldKeys: string[], maxEvents: number): string[] => {
  const headers = [...fieldKeys];

  for (let i = 1; i <= maxEvents; i++) {
    headers.push(
      `Código Evento linha ${i}`,
      `Descrição Evento linha ${i}`,
      `Referência linha ${i}`,
      `Valor Vencimento linha ${i}`,
      `Valor Desconto linha ${i}`,
    );
  }

  return headers;
};

export const exportToExcel = (data: ExtractedData, filename: string, selectedColumns?: string[]): void => {
  // Always rebuild tabs from months to reflect user edits
  const liveTabs = rebuildLiveTabs(data);
  
  if (liveTabs && Object.keys(liveTabs).length > 0) {
    const workbook = XLSX.utils.book_new();
    
    // Create a worksheet for each tab
    Object.entries(liveTabs).forEach(([tabType, tabData]) => {
      if (!tabData) return;
      
      const headers = selectedColumns ? 
        tabData.columns.filter(h => selectedColumns.includes(h)) : 
        tabData.columns;
      
      const filteredRows = tabData.rows.map(row => {
        const filtered: Record<string, string> = {};
        headers.forEach(h => { filtered[h] = row[h] || ''; });
        return filtered;
      });
      
      const worksheet = XLSX.utils.json_to_sheet(filteredRows, { header: headers });
      worksheet['!cols'] = headers.map(h => ({ wch: Math.min(Math.max(h.length + 2, 12), 40) }));
      
      const sheetName = tabType === 'vencimentos' ? 'Vencimentos' : 
                       tabType === 'descontos' ? 'Descontos' : 'QTDE';
      XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
    });
    
    XLSX.writeFile(workbook, `${filename}.xlsx`);
    return;
  }
  
  // Legacy export for backwards compatibility
  const maxEvents = getMaxEvents(data);
  const fieldKeys = collectFieldKeys(data);
  const rows = buildExcelRows(data, fieldKeys, maxEvents);
  const allHeaders = getOrderedHeaders(fieldKeys, maxEvents);
  const headers = selectedColumns ? allHeaders.filter(h => selectedColumns.includes(h)) : allHeaders;

  const filteredRows = rows.map(row => {
    const filtered: Record<string, string> = {};
    headers.forEach(h => { filtered[h] = row[h] || ''; });
    return filtered;
  });

  const worksheet = XLSX.utils.json_to_sheet(filteredRows, { header: headers });
  worksheet['!cols'] = headers.map(h => ({ wch: Math.min(Math.max(h.length + 2, 12), 40) }));

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Dados');
  XLSX.writeFile(workbook, `${filename}.xlsx`);
};

export const exportToCSV = (data: ExtractedData, filename: string, selectedColumns?: string[]): void => {
  // Check if we have new tab structure - export first available tab
  if (data.tabs && Object.keys(data.tabs).length > 0) {
    const firstTabData = Object.values(data.tabs)[0];
    if (!firstTabData) return;
    
    const headers = selectedColumns ? 
      firstTabData.columns.filter(h => selectedColumns.includes(h)) : 
      firstTabData.columns;

    const csvRows: string[][] = [headers];
    firstTabData.rows.forEach(row => {
      csvRows.push(headers.map(h => row[h] || ''));
    });

    const csvContent = csvRows
      .map(row => row.map(cell => `"${(cell || '').replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${filename}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
    return;
  }
  
  // Legacy export for backwards compatibility
  const maxEvents = getMaxEvents(data);
  const fieldKeys = collectFieldKeys(data);
  const rows = buildExcelRows(data, fieldKeys, maxEvents);
  const allHeaders = getOrderedHeaders(fieldKeys, maxEvents);
  const headers = selectedColumns ? allHeaders.filter(h => selectedColumns.includes(h)) : allHeaders;

  const csvRows: string[][] = [headers];
  rows.forEach(row => {
    csvRows.push(headers.map(h => row[h] || ''));
  });

  const csvContent = csvRows
    .map(row => row.map(cell => `"${(cell || '').replace(/"/g, '""')}"`).join(','))
    .join('\n');

  const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${filename}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
};

/** Collect all available columns (field keys + event columns) for column selector */
export const getAllAvailableColumns = (data: ExtractedData): { fieldColumns: string[]; eventColumns: string[] } => {
  const fieldColumns = collectFieldKeys(data);
  const maxEvents = getMaxEvents(data);
  const eventColumns: string[] = [];
  for (let i = 1; i <= maxEvents; i++) {
    eventColumns.push(
      `Código Evento linha ${i}`,
      `Descrição Evento linha ${i}`,
      `Referência linha ${i}`,
      `Valor Vencimento linha ${i}`,
      `Valor Desconto linha ${i}`,
    );
  }
  return { fieldColumns, eventColumns };
};
