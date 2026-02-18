import React, { useState, useMemo } from 'react';
import { FileSpreadsheet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ExtractedData } from '@/types';
import { exportToExcel, exportToCSV } from '@/lib/export';
import { useToast } from '@/hooks/use-toast';

interface ExportColumnSelectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: ExtractedData;
  filename: string;
}

const HEADER_COLUMNS = [
  'Empresa', 'CNPJ', 'Centro de Custo', 'Tipo de Folha', 'Competência',
  'Folha Nº', 'Código Funcionário', 'Nome Funcionário', 'CBO',
  'Departamento', 'Filial', 'Cargo',
];

const FOOTER_COLUMNS = [
  'Data de Admissão', 'Salário Base', 'Total Vencimentos', 'Total Descontos',
  'Valor Líquido', 'Base INSS', 'Base FGTS', 'FGTS do Mês', 'Base IRRF',
  'IRRF', 'Banco', 'Agência', 'Conta Corrente',
];

const ExportColumnSelector: React.FC<ExportColumnSelectorProps> = ({ open, onOpenChange, data, filename }) => {
  const { toast } = useToast();

  const maxEvents = useMemo(() => {
    let max = 0;
    for (const m of data.months) {
      if ((m.eventos?.length || 0) > max) max = m.eventos?.length || 0;
    }
    return Math.max(max, 1);
  }, [data]);

  const eventColumns = useMemo(() => {
    const cols: string[] = [];
    for (let i = 1; i <= maxEvents; i++) {
      cols.push(
        `Código Evento linha ${i}`,
        `Descrição Evento linha ${i}`,
        `Referência linha ${i}`,
        `Valor Vencimento linha ${i}`,
        `Valor Desconto linha ${i}`,
      );
    }
    return cols;
  }, [maxEvents]);

  const allColumns = useMemo(() => [...HEADER_COLUMNS, ...eventColumns, ...FOOTER_COLUMNS], [eventColumns]);

  const [selectedColumns, setSelectedColumns] = useState<string[]>(allColumns);

  // Reset when dialog opens
  React.useEffect(() => {
    if (open) setSelectedColumns(allColumns);
  }, [open, allColumns]);

  const toggleColumn = (col: string) => {
    setSelectedColumns(prev =>
      prev.includes(col) ? prev.filter(c => c !== col) : [...prev, col]
    );
  };

  const selectAll = () => setSelectedColumns(allColumns);
  const deselectAll = () => setSelectedColumns([]);

  const handleExport = (format: 'xlsx' | 'csv') => {
    if (selectedColumns.length === 0) {
      toast({ variant: 'destructive', title: 'Selecione ao menos uma coluna' });
      return;
    }
    if (format === 'xlsx') {
      exportToExcel(data, filename, selectedColumns);
    } else {
      exportToCSV(data, filename, selectedColumns);
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
            Selecione as colunas que deseja incluir na exportação
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-muted-foreground">{selectedColumns.length} de {allColumns.length} colunas</span>
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={selectAll}>Todas</Button>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={deselectAll}>Nenhuma</Button>
          </div>
        </div>

        <ScrollArea className="h-[350px] border rounded-lg">
          <div className="p-2 space-y-0.5">
            <p className="text-xs font-semibold text-muted-foreground px-2 pt-1 pb-1">Cabeçalho</p>
            {HEADER_COLUMNS.map(col => (
              <label key={col} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer text-sm">
                <Checkbox checked={selectedColumns.includes(col)} onCheckedChange={() => toggleColumn(col)} />
                {col}
              </label>
            ))}
            <p className="text-xs font-semibold text-muted-foreground px-2 pt-3 pb-1">Eventos ({maxEvents} linhas)</p>
            {eventColumns.map(col => (
              <label key={col} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer text-sm">
                <Checkbox checked={selectedColumns.includes(col)} onCheckedChange={() => toggleColumn(col)} />
                {col}
              </label>
            ))}
            <p className="text-xs font-semibold text-muted-foreground px-2 pt-3 pb-1">Rodapé / Totais</p>
            {FOOTER_COLUMNS.map(col => (
              <label key={col} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer text-sm">
                <Checkbox checked={selectedColumns.includes(col)} onCheckedChange={() => toggleColumn(col)} />
                {col}
              </label>
            ))}
          </div>
        </ScrollArea>

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
