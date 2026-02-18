import * as XLSX from 'xlsx';
import { ExtractedData, PayslipEvent } from '@/types';

/**
 * Determine the max number of events across all months
 */
const getMaxEvents = (data: ExtractedData): number => {
  let max = 0;
  for (const month of data.months) {
    const count = (month.eventos || []).length;
    if (count > max) max = count;
  }
  return Math.max(max, 1); // at least 1
};

/**
 * Build a single row per month matching the exact Excel format
 */
const buildExcelRows = (data: ExtractedData, maxEvents: number): Record<string, string>[] => {
  return data.months.map(month => {
    const row: Record<string, string> = {};

    // Header fields
    row['Empresa'] = month.empresa || '';
    row['CNPJ'] = month.cnpj || data.cnpj || '';
    row['Centro de Custo'] = month.centroCusto || '';
    row['Tipo de Folha'] = month.tipoFolha || '';
    row['Competência'] = month.competencia || month.month || '';
    row['Folha Nº'] = month.folhaNumero || '';
    row['Código Funcionário'] = month.codigoFuncionario || '';
    row['Nome Funcionário'] = month.nomeFuncionario || data.employeeName || '';
    row['CBO'] = month.cbo || '';
    row['Departamento'] = month.departamento || '';
    row['Filial'] = month.filial || '';
    row['Cargo'] = month.cargo || '';

    // Event lines - only up to maxEvents
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

    // Footer fields
    row['Data de Admissão'] = month.dataAdmissao || '';
    row['Salário Base'] = month.salarioBase || '';
    row['Total Vencimentos'] = month.totalVencimentos || '';
    row['Total Descontos'] = month.totalDescontos || '';
    row['Valor Líquido'] = month.valorLiquido || '';
    row['Base INSS'] = month.baseInss || '';
    row['Base FGTS'] = month.baseFgts || '';
    row['FGTS do Mês'] = month.fgtsMes || '';
    row['Base IRRF'] = month.baseIrrf || '';
    row['IRRF'] = month.irrf || '';
    row['Banco'] = month.banco || '';
    row['Agência'] = month.agencia || '';
    row['Conta Corrente'] = month.contaCorrente || '';

    return row;
  });
};

/**
 * Build headers in the exact order, with dynamic event count
 */
const getOrderedHeaders = (maxEvents: number): string[] => {
  const headers = [
    'Empresa', 'CNPJ', 'Centro de Custo', 'Tipo de Folha', 'Competência',
    'Folha Nº', 'Código Funcionário', 'Nome Funcionário', 'CBO',
    'Departamento', 'Filial', 'Cargo',
  ];

  for (let i = 1; i <= maxEvents; i++) {
    headers.push(
      `Código Evento linha ${i}`,
      `Descrição Evento linha ${i}`,
      `Referência linha ${i}`,
      `Valor Vencimento linha ${i}`,
      `Valor Desconto linha ${i}`,
    );
  }

  headers.push(
    'Data de Admissão', 'Salário Base', 'Total Vencimentos', 'Total Descontos',
    'Valor Líquido', 'Base INSS', 'Base FGTS', 'FGTS do Mês', 'Base IRRF',
    'IRRF', 'Banco', 'Agência', 'Conta Corrente',
  );

  return headers;
};

export const exportToExcel = (data: ExtractedData, filename: string, selectedColumns?: string[]): void => {
  const maxEvents = getMaxEvents(data);
  const rows = buildExcelRows(data, maxEvents);
  const allHeaders = getOrderedHeaders(maxEvents);
  const headers = selectedColumns ? allHeaders.filter(h => selectedColumns.includes(h)) : allHeaders;

  // Filter rows to only include selected columns
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
  const maxEvents = getMaxEvents(data);
  const rows = buildExcelRows(data, maxEvents);
  const allHeaders = getOrderedHeaders(maxEvents);
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
