import { ExtractedMonth, TabType, TabData } from '@/types';

/**
 * Build tab data from extracted months using event descriptions as column headers
 */
export const buildTabsFromMonths = (months: ExtractedMonth[], selectedTabs: TabType[]): Record<string, TabData> => {
  const tabsResult: Record<string, TabData> = {};
  
  if (months.length === 0) return tabsResult;

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
      columns: ['Mês', ...activeDescriptions],
      rows: months.map(month => {
        const row: Record<string, string> = {
          'Mês': month.month || ''
        };

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
      return 'referencia'; // Using referencia field for quantity data
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

  // Check which tabs have data
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