import React, { useState, useMemo } from 'react';
import { FileSpreadsheet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ExtractedData } from '@/types';
import { exportToExcel, exportToCSV, getAllAvailableColumns } from '@/lib/export';
import { useToast } from '@/hooks/use-toast';

interface ExportColumnSelectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: ExtractedData;
  filename: string;
}

const ExportColumnSelector: React.FC<ExportColumnSelectorProps> = ({ open, onOpenChange, data, filename }) => {
  const { toast } = useToast();

  const { fieldColumns, eventColumns } = useMemo(() => getAllAvailableColumns(data), [data]);
  const allColumns = useMemo(() => [...fieldColumns, ...eventColumns], [fieldColumns, eventColumns]);

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
            <p className="text-xs font-semibold text-muted-foreground px-2 pt-1 pb-1">Campos ({fieldColumns.length})</p>
            {fieldColumns.map(col => (
              <label key={col} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer text-sm">
                <Checkbox checked={selectedColumns.includes(col)} onCheckedChange={() => toggleColumn(col)} />
                {col}
              </label>
            ))}
            {eventColumns.length > 0 && (
              <>
                <p className="text-xs font-semibold text-muted-foreground px-2 pt-3 pb-1">Eventos ({eventColumns.length / 5} linhas)</p>
                {eventColumns.map(col => (
                  <label key={col} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer text-sm">
                    <Checkbox checked={selectedColumns.includes(col)} onCheckedChange={() => toggleColumn(col)} />
                    {col}
                  </label>
                ))}
              </>
            )}
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
