import React, { useState, useEffect, useMemo } from 'react';
import { Search, Settings2, ChevronLeft, ChevronRight } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ExtractedData, TabData } from '@/types';
import { buildTabsFromMonths, getAvailableTabsFromMonths } from '@/lib/build-tabs';

const STORAGE_KEY = 'datatable-visible-columns';

interface ColumnDef {
  key: string;
  label: string;
  getValue: (month: any) => string;
}

/** Collect all unique field keys across all months, preserving first-appearance order */
const collectFieldKeys = (data: ExtractedData): string[] => {
  const keys: string[] = [];
  const seen = new Set<string>();
  for (const month of data.months) {
    for (const field of (month.fields || [])) {
      if (!seen.has(field.key)) {
        seen.add(field.key);
        keys.push(field.key);
      }
    }
  }
  return keys;
};

/** Build dynamic base columns from fields[] */
const getDynamicBaseColumns = (fieldKeys: string[]): ColumnDef[] => {
  return fieldKeys.map(key => ({
    key: `field_${key}`,
    label: key,
    getValue: (m: any) => {
      const field = (m.fields || []).find((f: any) => f.key === key);
      return field?.value || '';
    },
  }));
};

const getEventColumns = (maxEvents: number): ColumnDef[] => {
  const cols: ColumnDef[] = [];
  for (let i = 0; i < maxEvents; i++) {
    const n = i + 1;
    cols.push(
      { key: `ev_cod_${i}`, label: `Cód. Evento ${n}`, getValue: m => m.eventos?.[i]?.codigo || '' },
      { key: `ev_desc_${i}`, label: `Desc. Evento ${n}`, getValue: m => m.eventos?.[i]?.descricao || '' },
      { key: `ev_ref_${i}`, label: `Ref. Evento ${n}`, getValue: m => m.eventos?.[i]?.referencia || '' },
      { key: `ev_venc_${i}`, label: `Venc. Evento ${n}`, getValue: m => m.eventos?.[i]?.vencimento || '' },
      { key: `ev_desc_val_${i}`, label: `Desc. Evento ${n}`, getValue: m => m.eventos?.[i]?.desconto || '' },
    );
  }
  return cols;
};

interface DataTableViewProps {
  data: ExtractedData;
}

const DataTableView: React.FC<DataTableViewProps> = ({ data }) => {
  const [search, setSearch] = useState('');
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [currentPage, setCurrentPage] = useState(0);
  const [visibleColumnKeys, setVisibleColumnKeys] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<string>('legacy');

  // Check if we have new tab data structure
  const hasTabData = data.tabs && Object.keys(data.tabs).length > 0;
  
  // Legacy logic for backwards compatibility
  const maxEvents = useMemo(() => {
    let max = 0;
    for (const m of data.months) {
      if ((m.eventos?.length || 0) > max) max = m.eventos?.length || 0;
    }
    return max;
  }, [data]);

  const fieldKeys = useMemo(() => collectFieldKeys(data), [data]);
  const baseColumns = useMemo(() => getDynamicBaseColumns(fieldKeys), [fieldKeys]);
  const allColumns = useMemo(() => [...baseColumns, ...getEventColumns(maxEvents)], [baseColumns, maxEvents]);

  // New tab-based data
  const availableTabs = useMemo(() => {
    if (!hasTabData) return [];
    return Object.keys(data.tabs || {});
  }, [hasTabData, data.tabs]);
  
  // Set default active tab
  useEffect(() => {
    if (hasTabData && availableTabs.length > 0 && activeTab === 'legacy') {
      setActiveTab(availableTabs[0]);
    }
  }, [hasTabData, availableTabs, activeTab]);

  // Load saved preferences
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const validKeys = allColumns.map(c => c.key);
        const filtered = parsed.filter((k: string) => validKeys.includes(k));
        if (filtered.length > 0) {
          setVisibleColumnKeys(filtered);
          return;
        }
      } catch {}
    }
    // Default: show base columns only
    setVisibleColumnKeys(baseColumns.map(c => c.key));
  }, [allColumns, baseColumns]);

  const savePreferences = (keys: string[]) => {
    setVisibleColumnKeys(keys);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(keys));
  };

  const toggleColumn = (key: string) => {
    const next = visibleColumnKeys.includes(key)
      ? visibleColumnKeys.filter(k => k !== key)
      : [...visibleColumnKeys, key];
    savePreferences(next);
  };

  const selectAllColumns = () => savePreferences(allColumns.map(c => c.key));
  const deselectAllColumns = () => savePreferences([]);

  const visibleColumns = allColumns.filter(c => visibleColumnKeys.includes(c.key));

  // Filter rows by search
  const filteredRows = useMemo(() => {
    if (!search.trim()) return data.months;
    const q = search.toLowerCase();
    return data.months.filter(month =>
      visibleColumns.some(col => col.getValue(month).toLowerCase().includes(q))
    );
  }, [data.months, search, visibleColumns]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / rowsPerPage));
  const pageRows = filteredRows.slice(currentPage * rowsPerPage, (currentPage + 1) * rowsPerPage);

  useEffect(() => { setCurrentPage(0); }, [search, rowsPerPage]);

  if (hasTabData) {
    return (
      <div className="space-y-3">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3">
            {availableTabs.includes('vencimentos') && (
              <TabsTrigger value="vencimentos">Vencimentos</TabsTrigger>
            )}
            {availableTabs.includes('descontos') && (
              <TabsTrigger value="descontos">Descontos</TabsTrigger>
            )}
            {availableTabs.includes('quantidade') && (
              <TabsTrigger value="quantidade">QTDE</TabsTrigger>
            )}
          </TabsList>

          {availableTabs.map(tabKey => (
            <TabsContent key={tabKey} value={tabKey} className="mt-4">
              <TabDataTable 
                tabData={data.tabs![tabKey]} 
                search={search}
                setSearch={setSearch}
                rowsPerPage={rowsPerPage}
                setRowsPerPage={setRowsPerPage}
              />
            </TabsContent>
          ))}
        </Tabs>
      </div>
    );
  }

  // Legacy view for backwards compatibility
  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar nos dados..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
        <Select value={String(rowsPerPage)} onValueChange={(v) => setRowsPerPage(Number(v))}>
          <SelectTrigger className="w-[130px] h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[5, 10, 20, 50, 100].map(n => (
              <SelectItem key={n} value={String(n)}>{n} linhas</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-9">
              <Settings2 className="h-4 w-4 mr-1" />
              Colunas
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-0" align="end">
            <div className="p-3 border-b flex items-center justify-between">
              <span className="text-sm font-medium">Colunas visíveis</span>
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={selectAllColumns}>Todas</Button>
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={deselectAllColumns}>Nenhuma</Button>
              </div>
            </div>
            <ScrollArea className="h-[300px]">
              <div className="p-2 space-y-1">
                {allColumns.map(col => (
                  <label key={col.key} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer text-sm">
                    <Checkbox
                      checked={visibleColumnKeys.includes(col.key)}
                      onCheckedChange={() => toggleColumn(col.key)}
                    />
                    {col.label}
                  </label>
                ))}
              </div>
            </ScrollArea>
          </PopoverContent>
        </Popover>
      </div>

      {/* Table */}
      <div className="rounded-lg border overflow-auto max-h-[calc(100vh-400px)]">
        <Table>
          <TableHeader>
            <TableRow>
              {visibleColumns.map(col => (
                <TableHead key={col.key} className="text-xs whitespace-nowrap">{col.label}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageRows.length > 0 ? pageRows.map((month, idx) => (
              <TableRow key={idx}>
                {visibleColumns.map(col => (
                  <TableCell key={col.key} className="text-xs py-2 whitespace-nowrap">
                    {col.getValue(month) || '-'}
                  </TableCell>
                ))}
              </TableRow>
            )) : (
              <TableRow>
                <TableCell colSpan={visibleColumns.length} className="text-center py-8 text-muted-foreground">
                  Nenhum dado encontrado
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {filteredRows.length} registro(s) • Página {currentPage + 1} de {totalPages}
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            disabled={currentPage === 0}
            onClick={() => setCurrentPage(p => p - 1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            disabled={currentPage >= totalPages - 1}
            onClick={() => setCurrentPage(p => p + 1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};

// Component for rendering individual tab data
const TabDataTable: React.FC<{
  tabData: TabData;
  search: string;
  setSearch: (search: string) => void;
  rowsPerPage: number;
  setRowsPerPage: (rows: number) => void;
}> = ({ tabData, search, setSearch, rowsPerPage, setRowsPerPage }) => {
  const [currentPage, setCurrentPage] = useState(0);
  const [visibleColumns, setVisibleColumns] = useState<string[]>([]);

  // Initialize visible columns
  useEffect(() => {
    if (tabData.columns.length > 0 && visibleColumns.length === 0) {
      setVisibleColumns(tabData.columns);
    }
  }, [tabData.columns, visibleColumns.length]);

  // Filter and paginate data
  const filteredRows = useMemo(() => {
    if (!search.trim()) return tabData.rows;
    const searchLower = search.toLowerCase();
    return tabData.rows.filter(row =>
      visibleColumns.some(col => (row[col] || '').toLowerCase().includes(searchLower))
    );
  }, [tabData.rows, search, visibleColumns]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / rowsPerPage));
  const pageRows = filteredRows.slice(currentPage * rowsPerPage, (currentPage + 1) * rowsPerPage);

  useEffect(() => { setCurrentPage(0); }, [search, rowsPerPage]);

  const toggleColumn = (col: string) => {
    setVisibleColumns(prev => 
      prev.includes(col) 
        ? prev.filter(c => c !== col)
        : [...prev, col]
    );
  };

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar nos dados..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
        <Select value={String(rowsPerPage)} onValueChange={(v) => setRowsPerPage(Number(v))}>
          <SelectTrigger className="w-[130px] h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[5, 10, 20, 50, 100].map(n => (
              <SelectItem key={n} value={String(n)}>{n} linhas</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-9">
              <Settings2 className="h-4 w-4 mr-1" />
              Colunas
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-0" align="end">
            <div className="p-3 border-b flex items-center justify-between">
              <span className="text-sm font-medium">Colunas visíveis</span>
              <div className="flex gap-1">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-7 text-xs" 
                  onClick={() => setVisibleColumns(tabData.columns)}
                >
                  Todas
                </Button>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-7 text-xs" 
                  onClick={() => setVisibleColumns(['Mês'])}
                >
                  Nenhuma
                </Button>
              </div>
            </div>
            <ScrollArea className="h-[300px]">
              <div className="p-2 space-y-1">
                {tabData.columns.map(col => (
                  <label key={col} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer text-sm">
                    <Checkbox
                      checked={visibleColumns.includes(col)}
                      onCheckedChange={() => toggleColumn(col)}
                    />
                    {col}
                  </label>
                ))}
              </div>
            </ScrollArea>
          </PopoverContent>
        </Popover>
      </div>

      {/* Table */}
      <div className="rounded-lg border overflow-auto max-h-[calc(100vh-400px)]">
        <Table>
          <TableHeader>
            <TableRow>
              {visibleColumns.map(col => (
                <TableHead key={col} className="text-xs whitespace-nowrap">{col}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageRows.length > 0 ? pageRows.map((row, idx) => (
              <TableRow key={idx}>
                {visibleColumns.map(col => (
                  <TableCell key={col} className="text-xs py-2 whitespace-nowrap">
                    {row[col] || '-'}
                  </TableCell>
                ))}
              </TableRow>
            )) : (
              <TableRow>
                <TableCell colSpan={visibleColumns.length} className="text-center py-8 text-muted-foreground">
                  Nenhum dado encontrado
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {filteredRows.length} registro(s) • Página {currentPage + 1} de {totalPages}
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            disabled={currentPage === 0}
            onClick={() => setCurrentPage(p => p - 1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            disabled={currentPage >= totalPages - 1}
            onClick={() => setCurrentPage(p => p + 1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default DataTableView;
