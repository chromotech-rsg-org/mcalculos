import React, { useState, useMemo } from 'react';
import { FileSpreadsheet, Hash } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ExtractedData, TabType, TabData } from '@/types';
import { exportToExcel, exportToCSV, getAllAvailableColumns } from '@/lib/export';
import { buildTabsFromMonths } from '@/lib/build-tabs';
import { useToast } from '@/hooks/use-toast';

interface ExportColumnSelectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: ExtractedData;
  filename: string;
}

const TAB_LABELS: Record<TabType, string> = {
  vencimentos: 'Vencimentos',
  descontos: 'Descontos',
  quantidade: 'QTDE',
};

// Padrões para identificar campos de cabeçalho (destacar em vermelho/rosa)
const HEADER_PATTERNS = [
  /cnpj/i,
  /empresa/i,
  /nome/i,
  /matr[íi]cula/i,
  /compet[eê]ncia/i,
  /lota[çc][aã]o/i,
  /cargo|fun[çc][aã]o/i,
  /admiss/i,
  /departamento/i,
  /n[íi]vel|classe/i,
  /banco|ag[êe]ncia|conta/i,
  /endere[çc]o|bairro|cidade|cep|uf/i,
];

// Padrões para identificar campos de rodapé (destacar em laranja/ambar)
const FOOTER_PATTERNS = [
  /sal[áa]rio\s*base/i,
  /base\s*fgts/i,
  /base\s*inss/i,
  /base\s*irrf/i,
  /total\s*vencimentos/i,
  /total\s*descontos/i,
  /valor\s*l[ií]quido/i,
  /folha\s*paga/i,
  /data\s*pagamento/i,
  /fgts\s*retido/i,
  /meses\s*trabalhados/i,
  /total\s*proventos/i,
  /total\s*dedu[çc][õo]es/i,
];

function isHeaderField(colName: string): boolean {
  return HEADER_PATTERNS.some(pattern => pattern.test(colName));
}

function isFooterField(colName: string): boolean {
  return FOOTER_PATTERNS.some(pattern => pattern.test(colName));
}

const ExportColumnSelector: React.FC<ExportColumnSelectorProps> = ({ open, onOpenChange, data, filename }) => {
  const { toast } = useToast();

  // Rebuild tabs from months to reflect user edits
  const liveTabs = useMemo(() => {
    if (!data.months || data.months.length === 0) return null;
    const hasEvents = data.months.some(m => m.eventos && m.eventos.length > 0);
    if (!hasEvents) return null;
    const tabs = buildTabsFromMonths(data.months, ['vencimentos', 'descontos', 'quantidade']);
    return Object.keys(tabs).length > 0 ? tabs : null;
  }, [data.months]);

  const hasTabData = liveTabs !== null;
  const availableTabs = useMemo(() => 
    hasTabData ? (Object.keys(liveTabs!) as TabType[]) : [],
    [hasTabData, liveTabs]
  );

  // Tab selection state
  const [selectedTabs, setSelectedTabs] = useState<TabType[]>(availableTabs);
  
  // Per-tab column selection
  const [selectedColumnsByTab, setSelectedColumnsByTab] = useState<Record<string, string[]>>({});

  // Legacy columns
  const { fieldColumns, eventColumns } = useMemo(() => getAllAvailableColumns(data), [data]);
  const allLegacyColumns = useMemo(() => [...fieldColumns, ...eventColumns], [fieldColumns, eventColumns]);
  const [selectedLegacyColumns, setSelectedLegacyColumns] = useState<string[]>(allLegacyColumns);

  // Reset when dialog opens
  React.useEffect(() => {
    if (open) {
      setSelectedTabs(availableTabs);
      setSelectedLegacyColumns(allLegacyColumns);
      // Initialize per-tab columns
      const colsByTab: Record<string, string[]> = {};
      availableTabs.forEach(tab => {
        colsByTab[tab] = liveTabs![tab]?.columns || [];
      });
      setSelectedColumnsByTab(colsByTab);
    }
  }, [open, availableTabs, allLegacyColumns, liveTabs]);

  const toggleTab = (tab: TabType) => {
    setSelectedTabs(prev =>
      prev.includes(tab) ? prev.filter(t => t !== tab) : [...prev, tab]
    );
  };

  const toggleTabColumn = (tab: string, col: string) => {
    setSelectedColumnsByTab(prev => ({
      ...prev,
      [tab]: (prev[tab] || []).includes(col)
        ? (prev[tab] || []).filter(c => c !== col)
        : [...(prev[tab] || []), col],
    }));
  };

  const handleExport = (format: 'xlsx' | 'csv') => {
    if (hasTabData) {
      if (selectedTabs.length === 0) {
        toast({ variant: 'destructive', title: 'Selecione ao menos uma aba' });
        return;
      }
      // Build filtered tab data
      const filteredData: ExtractedData = {
        ...data,
        tabs: {},
      };
      selectedTabs.forEach(tab => {
        if (liveTabs![tab]) {
          const cols = selectedColumnsByTab[tab] || liveTabs![tab]!.columns;
          filteredData.tabs![tab] = {
            columns: cols,
            rows: liveTabs![tab]!.rows,
          };
        }
      });
      if (format === 'xlsx') {
        exportToExcel(filteredData, filename, undefined);
      } else {
        exportToCSV(filteredData, filename, undefined);
      }
    } else {
      if (selectedLegacyColumns.length === 0) {
        toast({ variant: 'destructive', title: 'Selecione ao menos uma coluna' });
        return;
      }
      if (format === 'xlsx') {
        exportToExcel(data, filename, selectedLegacyColumns);
      } else {
        exportToCSV(data, filename, selectedLegacyColumns);
      }
    }
    toast({ title: 'Exportação concluída!', description: `Arquivo ${format.toUpperCase()} baixado.` });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Exportar Dados</DialogTitle>
          <DialogDescription>
            {hasTabData
              ? 'Selecione quais abas e colunas deseja exportar'
              : 'Selecione as colunas que deseja incluir na exportação'}
          </DialogDescription>
        </DialogHeader>

        {hasTabData ? (
          <div className="space-y-3">
            {/* Tab selection */}
            <div className="space-y-2">
              <p className="text-sm font-medium">Abas para exportar</p>
              {availableTabs.map(tab => (
                <label key={tab} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer text-sm">
                  <Checkbox
                    checked={selectedTabs.includes(tab)}
                    onCheckedChange={() => toggleTab(tab)}
                  />
                  {TAB_LABELS[tab]}
                  <span className="text-muted-foreground text-xs ml-auto">
                    {liveTabs![tab]?.columns.length || 0} colunas
                  </span>
                </label>
              ))}
            </div>

            {/* Per-tab column selection */}
            {selectedTabs.length > 0 && (
              <Tabs defaultValue={selectedTabs[0]}>
                <TabsList className="w-full">
                  {selectedTabs.map(tab => (
                    <TabsTrigger key={tab} value={tab} className="text-xs">
                      {TAB_LABELS[tab]}
                    </TabsTrigger>
                  ))}
                </TabsList>
                {selectedTabs.map(tab => (
                  <TabsContent key={tab} value={tab}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-muted-foreground">
                        {(selectedColumnsByTab[tab] || []).length} de {liveTabs![tab]?.columns.length || 0}
                      </span>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" className="h-6 text-xs"
                          onClick={() => setSelectedColumnsByTab(prev => ({ ...prev, [tab]: liveTabs![tab]?.columns || [] }))}>
                          Todas
                        </Button>
                        <Button variant="ghost" size="sm" className="h-6 text-xs"
                          onClick={() => setSelectedColumnsByTab(prev => ({ ...prev, [tab]: [] }))}>
                          Nenhuma
                        </Button>
                      </div>
                    </div>
                    <ScrollArea className="h-[200px] border rounded-lg">
                      <div className="p-2 space-y-0.5">
                        {[...(liveTabs![tab]?.columns || [])].sort((a, b) => a.localeCompare(b, 'pt-BR')).map(col => (
                          <label key={col} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-muted cursor-pointer text-sm">
                            <Checkbox
                              checked={(selectedColumnsByTab[tab] || []).includes(col)}
                              onCheckedChange={() => toggleTabColumn(tab, col)}
                            />
                            {col}
                          </label>
                        ))}
                      </div>
                    </ScrollArea>
                  </TabsContent>
                ))}
              </Tabs>
            )}
          </div>
        ) : (
          /* Legacy column selector */
          <>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">{selectedLegacyColumns.length} de {allLegacyColumns.length} colunas</span>
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setSelectedLegacyColumns(allLegacyColumns)}>Todas</Button>
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setSelectedLegacyColumns([])}>Nenhuma</Button>
              </div>
            </div>
            <ScrollArea className="h-[350px] border rounded-lg">
              <div className="p-2 space-y-0.5">
                <p className="text-xs font-semibold text-muted-foreground px-2 pt-1 pb-1">Campos ({fieldColumns.length})</p>
                {fieldColumns.map(col => (
                  <label key={col} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer text-sm">
                    <Checkbox checked={selectedLegacyColumns.includes(col)} onCheckedChange={() => {
                      setSelectedLegacyColumns(prev => prev.includes(col) ? prev.filter(c => c !== col) : [...prev, col]);
                    }} />
                    {col}
                  </label>
                ))}
                {eventColumns.length > 0 && (
                  <>
                    <p className="text-xs font-semibold text-muted-foreground px-2 pt-3 pb-1">Eventos ({eventColumns.length / 5} linhas)</p>
                    {eventColumns.map(col => (
                      <label key={col} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer text-sm">
                        <Checkbox checked={selectedLegacyColumns.includes(col)} onCheckedChange={() => {
                          setSelectedLegacyColumns(prev => prev.includes(col) ? prev.filter(c => c !== col) : [...prev, col]);
                        }} />
                        {col}
                      </label>
                    ))}
                  </>
                )}
              </div>
            </ScrollArea>
          </>
        )}

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={() => handleExport('csv')}>
            Exportar CSV
          </Button>
          <Button onClick={() => handleExport('xlsx')} className="gradient-primary text-primary-foreground">
            <FileSpreadsheet className="h-4 w-4 mr-2" />
            Exportar Excel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ExportColumnSelector;
