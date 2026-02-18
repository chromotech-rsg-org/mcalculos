import React, { useState, useEffect, useMemo } from 'react';
import { Search, Settings2, ChevronLeft, ChevronRight } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ExtractedData } from '@/types';

const STORAGE_KEY = 'datatable-visible-columns';

interface ColumnDef {
  key: string;
  label: string;
  getValue: (month: any) => string;
}

const getBaseColumns = (): ColumnDef[] => [
  { key: 'competencia', label: 'Competência', getValue: m => m.competencia || m.month || '' },
  { key: 'empresa', label: 'Empresa', getValue: m => m.empresa || '' },
  { key: 'cnpj', label: 'CNPJ', getValue: m => m.cnpj || '' },
  { key: 'centroCusto', label: 'Centro de Custo', getValue: m => m.centroCusto || '' },
  { key: 'tipoFolha', label: 'Tipo de Folha', getValue: m => m.tipoFolha || '' },
  { key: 'folhaNumero', label: 'Folha Nº', getValue: m => m.folhaNumero || '' },
  { key: 'codigoFuncionario', label: 'Cód. Funcionário', getValue: m => m.codigoFuncionario || '' },
  { key: 'nomeFuncionario', label: 'Nome Funcionário', getValue: m => m.nomeFuncionario || '' },
  { key: 'cbo', label: 'CBO', getValue: m => m.cbo || '' },
  { key: 'departamento', label: 'Departamento', getValue: m => m.departamento || '' },
  { key: 'filial', label: 'Filial', getValue: m => m.filial || '' },
  { key: 'cargo', label: 'Cargo', getValue: m => m.cargo || '' },
  { key: 'dataAdmissao', label: 'Data Admissão', getValue: m => m.dataAdmissao || '' },
  { key: 'salarioBase', label: 'Salário Base', getValue: m => m.salarioBase || '' },
  { key: 'totalVencimentos', label: 'Total Vencimentos', getValue: m => m.totalVencimentos || '' },
  { key: 'totalDescontos', label: 'Total Descontos', getValue: m => m.totalDescontos || '' },
  { key: 'valorLiquido', label: 'Valor Líquido', getValue: m => m.valorLiquido || '' },
  { key: 'baseInss', label: 'Base INSS', getValue: m => m.baseInss || '' },
  { key: 'baseFgts', label: 'Base FGTS', getValue: m => m.baseFgts || '' },
  { key: 'fgtsMes', label: 'FGTS do Mês', getValue: m => m.fgtsMes || '' },
  { key: 'baseIrrf', label: 'Base IRRF', getValue: m => m.baseIrrf || '' },
  { key: 'irrf', label: 'IRRF', getValue: m => m.irrf || '' },
  { key: 'banco', label: 'Banco', getValue: m => m.banco || '' },
  { key: 'agencia', label: 'Agência', getValue: m => m.agencia || '' },
  { key: 'contaCorrente', label: 'Conta Corrente', getValue: m => m.contaCorrente || '' },
];

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

  const maxEvents = useMemo(() => {
    let max = 0;
    for (const m of data.months) {
      if ((m.eventos?.length || 0) > max) max = m.eventos?.length || 0;
    }
    return max;
  }, [data]);

  const allColumns = useMemo(() => [...getBaseColumns(), ...getEventColumns(maxEvents)], [maxEvents]);

  // Load saved preferences
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Filter to only keys that exist in current column set
        const validKeys = allColumns.map(c => c.key);
        const filtered = parsed.filter((k: string) => validKeys.includes(k));
        if (filtered.length > 0) {
          setVisibleColumnKeys(filtered);
          return;
        }
      } catch {}
    }
    // Default: show base columns only
    setVisibleColumnKeys(getBaseColumns().map(c => c.key));
  }, [allColumns]);

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

export default DataTableView;
