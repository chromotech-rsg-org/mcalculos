import { ExtractedMonth, TabType, TabData } from '@/types';

const normalizeComparableKey = (value: string): string => {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\|+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
};

const isTableArtifactFieldKey = (key: string): boolean => {
  const trimmed = key.trim();
  return /^\d{3,4}\s+/.test(trimmed) || trimmed.includes('|');
};

const collectNormalizedEventDescriptions = (months: ExtractedMonth[]): Set<string> => {
  const descriptions = new Set<string>();

  months.forEach(month => {
    month.eventos?.forEach(event => {
      if (event.descricao?.trim()) {
        descriptions.add(normalizeComparableKey(event.descricao));
      }
    });
  });

  return descriptions;
};

/**
 * Collect all unique field keys from months[].fields[], preserving first-appearance order.
 */
const collectDynamicFieldKeys = (months: ExtractedMonth[]): string[] => {
  const keys: string[] = [];
  const seen = new Set<string>();
  for (const month of months) {
    for (const field of (month.fields || [])) {
      if (field.key && !seen.has(field.key)) {
        seen.add(field.key);
        keys.push(field.key);
      }
    }
  }
  return keys;
};

/** Get a dynamic field value from an ExtractedMonth by key */
const getDynamicFieldValue = (month: ExtractedMonth, key: string): string => {
  const field = (month.fields || []).find(f => f.key === key);
  return field?.value || '';
};

/**
 * Build tab data from extracted months using event descriptions as column headers.
 * Each row includes ALL dynamic fields from fields[] + event description columns.
 */
export const buildTabsFromMonths = (months: ExtractedMonth[], selectedTabs: TabType[]): Record<string, TabData> => {
  const tabsResult: Record<string, TabData> = {};
  
  if (months.length === 0) return tabsResult;

  // Collect all dynamic field keys from fields[] (header, footer, bank data, etc.)
  const allFieldKeys = collectDynamicFieldKeys(months);
  const normalizedEventDescriptions = collectNormalizedEventDescriptions(months);
  
  // Only include fields that have data in at least one month
  const activeFieldKeys = allFieldKeys.filter(key =>
    !isTableArtifactFieldKey(key) &&
    !normalizedEventDescriptions.has(normalizeComparableKey(key)) &&
    months.some(month => getDynamicFieldValue(month, key) !== '')
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
      columns: [...activeFieldKeys, ...activeDescriptions],
      rows: months.map(month => {
        const row: Record<string, string> = {};

        // Add all dynamic fields from fields[]
        activeFieldKeys.forEach(key => {
          row[key] = getDynamicFieldValue(month, key);
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
