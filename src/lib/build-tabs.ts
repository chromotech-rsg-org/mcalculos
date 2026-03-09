import { ExtractedMonth, TabType, TabData } from '@/types';

/** Header fields to include in every tab row */
const HEADER_FIELDS = [
  'Mês',
  'Empresa',
  'CNPJ',
  'Funcionário',
  'CPF',
  'Cargo',
  'Departamento',
  'Filial',
  'Centro de Custo',
  'Admissão',
  'CBO',
  'PIS',
  'Identidade',
  'Salário Base',
  'Total Vencimentos',
  'Total Descontos',
  'Valor Líquido',
  'Base INSS',
  'Base FGTS',
  'FGTS Mês',
  'Base IRRF',
  'IRRF',
  'Banco',
  'Agência',
  'Conta Corrente',
];

/** Get header field value from an ExtractedMonth */
const getHeaderFieldValue = (month: ExtractedMonth, field: string): string => {
  switch (field) {
    case 'Mês': return month.month || month.competencia || '';
    case 'Empresa': return month.empresa || '';
    case 'CNPJ': return month.cnpj || '';
    case 'Funcionário': return month.nomeFuncionario || '';
    case 'CPF': return month.cpf || '';
    case 'Cargo': return month.cargo || '';
    case 'Departamento': return month.departamento || '';
    case 'Filial': return month.filial || '';
    case 'Centro de Custo': return month.centroCusto || '';
    case 'Admissão': return month.dataAdmissao || '';
    case 'CBO': return month.cbo || '';
    case 'PIS': return month.pis || '';
    case 'Identidade': return month.identidade || '';
    case 'Salário Base': return month.salarioBase || '';
    case 'Total Vencimentos': return month.totalVencimentos || '';
    case 'Total Descontos': return month.totalDescontos || '';
    case 'Valor Líquido': return month.valorLiquido || '';
    case 'Base INSS': return month.baseInss || '';
    case 'Base FGTS': return month.baseFgts || '';
    case 'FGTS Mês': return month.fgtsMes || '';
    case 'Base IRRF': return month.baseIrrf || '';
    case 'IRRF': return month.irrf || '';
    case 'Banco': return month.banco || '';
    case 'Agência': return month.agencia || '';
    case 'Conta Corrente': return month.contaCorrente || '';
    default: return '';
  }
};

/**
 * Build tab data from extracted months using event descriptions as column headers.
 * Each row includes header fields (empresa, funcionário, etc.) + event description columns.
 */
export const buildTabsFromMonths = (months: ExtractedMonth[], selectedTabs: TabType[]): Record<string, TabData> => {
  const tabsResult: Record<string, TabData> = {};
  
  if (months.length === 0) return tabsResult;

  // Determine which header fields actually have data
  const activeHeaderFields = HEADER_FIELDS.filter(field =>
    months.some(month => getHeaderFieldValue(month, field) !== '')
  );

  // Collect all unique event descriptions across all months
  const allDescriptions = new Set<string>();
  months.forEach(month => {
    month.eventos?.forEach(event => {
      if (event.descricao && event.descricao.trim()) {
        allDescriptions.add(event.descricao);
      }
    });
  });

  const descriptionsArray = Array.from(allDescriptions);

  // Build tabs based on selection
  selectedTabs.forEach(tabType => {
    const tabField = getTabFieldName(tabType);
    
    // Only include descriptions that have non-zero values in this tab
    const activeDescriptions = descriptionsArray.filter(desc => {
      return months.some(month => {
        const event = month.eventos?.find(e => e.descricao === desc);
        return event && event[tabField] && event[tabField] !== '0' && event[tabField] !== '';
      });
    });

    if (activeDescriptions.length === 0) return;

    const tabData: TabData = {
      columns: [...activeHeaderFields, ...activeDescriptions],
      rows: months.map(month => {
        const row: Record<string, string> = {};

        // Add header fields
        activeHeaderFields.forEach(field => {
          row[field] = getHeaderFieldValue(month, field);
        });

        // Add values for each active description
        activeDescriptions.forEach(desc => {
          const event = month.eventos?.find(e => e.descricao === desc);
          row[desc] = event?.[tabField] || '';
        });

        return row;
      })
    };

    tabsResult[tabType] = tabData;
  });

  return tabsResult;
};

/**
 * Get the field name for a specific tab type
 */
const getTabFieldName = (tabType: TabType): keyof import('@/types').PayslipEvent => {
  switch (tabType) {
    case 'vencimentos':
      return 'vencimento';
    case 'descontos':
      return 'desconto';
    case 'quantidade':
      return 'referencia';
    default:
      return 'vencimento';
  }
};

/**
 * Get all available tabs from extracted months
 */
export const getAvailableTabsFromMonths = (months: ExtractedMonth[]): TabType[] => {
  const availableTabs: TabType[] = [];
  
  if (months.length === 0) return availableTabs;

  const hasVencimentos = months.some(month => 
    month.eventos?.some(e => e.vencimento && e.vencimento !== '0' && e.vencimento !== '')
  );
  
  const hasDescontos = months.some(month => 
    month.eventos?.some(e => e.desconto && e.desconto !== '0' && e.desconto !== '')
  );
  
  const hasQuantidade = months.some(month => 
    month.eventos?.some(e => e.referencia && e.referencia !== '0' && e.referencia !== '')
  );

  if (hasVencimentos) availableTabs.push('vencimentos');
  if (hasDescontos) availableTabs.push('descontos');
  if (hasQuantidade) availableTabs.push('quantidade');

  return availableTabs;
};
