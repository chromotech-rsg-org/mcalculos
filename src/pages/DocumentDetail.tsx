import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, FileText, Download, Trash2, Edit2, Save, X, Loader2, FileSpreadsheet, AlertCircle, CheckCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { getDocumentById, saveDocument, deleteDocument } from '@/lib/storage';
import { Document, ExtractedData, ExtractedMonth } from '@/types';
import { extractDataFromPDF, extractDataFromImage } from '@/lib/extraction';
import { exportToExcel, exportToCSV } from '@/lib/export';

const PATTERN_OPTIONS = [
  { value: 'auto', label: 'Auto-detectar' },
  { value: '1a', label: '1a - Holerite Normal (Folha Mensal)' },
];

const DocumentDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [doc, setDoc] = useState<Document | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionProgress, setExtractionProgress] = useState(0);
  const [editingCell, setEditingCell] = useState<{ monthIndex: number; field: string; subField?: string; eventIndex?: number } | null>(null);
  const [editValue, setEditValue] = useState('');
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [activeFileIndex, setActiveFileIndex] = useState(0);
  const [selectedPattern, setSelectedPattern] = useState<string>('auto');
  
  const pdfContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (id) {
      const document = getDocumentById(id);
      if (document) {
        setDoc(document);
        setSelectedPattern(document.payslipPattern || document.extractedData?.payslipPattern || 'auto');
      } else {
        navigate('/documents');
      }
    }
  }, [id, navigate]);

  const handlePatternChange = (value: string) => {
    setSelectedPattern(value);
    if (doc) {
      const updatedDoc = {
        ...doc,
        payslipPattern: value !== 'auto' ? value : undefined,
        updatedAt: new Date().toISOString(),
      };
      setDoc(updatedDoc);
      saveDocument(updatedDoc);
    }
  };

  const handleExtraction = async () => {
    if (!doc) return;
    
    setIsExtracting(true);
    setExtractionProgress(0);
    
    const updatedDoc = { ...doc, status: 'extracting' as const };
    setDoc(updatedDoc);
    saveDocument(updatedDoc);
    
    try {
      let allMonths: ExtractedMonth[] = [];
      let employeeName = '';
      let cnpj = '';
      let documentType: ExtractedData['documentType'] = 'holerite_normal';
      let detectedPattern: string | undefined;
      
      for (let i = 0; i < doc.files.length; i++) {
        const file = doc.files[i];
        setExtractionProgress(Math.round(((i + 1) / doc.files.length) * 100));
        
        let extractedData: ExtractedData;
        const patternToUse = selectedPattern !== 'auto' ? selectedPattern : undefined;
        
        if (file.type === 'application/pdf') {
          extractedData = await extractDataFromPDF(file.base64, patternToUse);
        } else {
          extractedData = await extractDataFromImage(file.base64);
        }
        
        if (extractedData.employeeName) employeeName = extractedData.employeeName;
        if (extractedData.cnpj) cnpj = extractedData.cnpj;
        documentType = extractedData.documentType;
        if (extractedData.payslipPattern) detectedPattern = extractedData.payslipPattern;
        allMonths = [...allMonths, ...extractedData.months];
      }
      
      const finalData: ExtractedData = {
        employeeName,
        cnpj,
        documentType,
        payslipPattern: detectedPattern || (selectedPattern !== 'auto' ? selectedPattern : undefined),
        months: allMonths,
        extractedAt: new Date().toISOString(),
      };
      
      const finalDoc = {
        ...doc,
        extractedData: finalData,
        payslipPattern: detectedPattern || doc.payslipPattern,
        status: 'extracted' as const,
        updatedAt: new Date().toISOString(),
      };
      
      setDoc(finalDoc);
      saveDocument(finalDoc);
      
      // Update selected pattern to detected one
      if (detectedPattern && selectedPattern === 'auto') {
        setSelectedPattern(detectedPattern);
      }
      
      toast({
        title: 'Extração concluída!',
        description: `${allMonths.length} período(s) extraído(s) com sucesso.`,
      });
    } catch (error) {
      console.error('Extraction error:', error);
      const errorDoc = { ...doc, status: 'error' as const };
      setDoc(errorDoc);
      saveDocument(errorDoc);
      
      toast({
        variant: 'destructive',
        title: 'Erro na extração',
        description: 'Ocorreu um erro ao processar o documento.',
      });
    }
    
    setIsExtracting(false);
  };

  const startEditing = (monthIndex: number, field: string, currentValue: string, subField?: string, eventIndex?: number) => {
    setEditingCell({ monthIndex, field, subField, eventIndex });
    setEditValue(currentValue);
  };

  const saveEdit = () => {
    if (!doc || !doc.extractedData || !editingCell) return;
    
    const updatedMonths = [...doc.extractedData.months];
    const month = { ...updatedMonths[editingCell.monthIndex] };
    
    if (editingCell.eventIndex !== undefined && editingCell.subField && month.eventos) {
      const eventos = [...month.eventos];
      eventos[editingCell.eventIndex] = {
        ...eventos[editingCell.eventIndex],
        [editingCell.subField]: editValue,
      };
      month.eventos = eventos;
    } else {
      // Direct field on month
      (month as any)[editingCell.field] = editValue;
    }
    
    updatedMonths[editingCell.monthIndex] = month;
    
    const updatedDoc = {
      ...doc,
      extractedData: { ...doc.extractedData, months: updatedMonths },
      updatedAt: new Date().toISOString(),
    };
    
    setDoc(updatedDoc);
    saveDocument(updatedDoc);
    setEditingCell(null);
    
    toast({ title: 'Salvo!', description: 'Alteração salva com sucesso.' });
  };

  const cancelEdit = () => {
    setEditingCell(null);
    setEditValue('');
  };

  const deleteRow = (monthIndex: number) => {
    if (!doc || !doc.extractedData) return;
    
    const updatedMonths = doc.extractedData.months.filter((_, i) => i !== monthIndex);
    const updatedDoc = {
      ...doc,
      extractedData: { ...doc.extractedData, months: updatedMonths },
      updatedAt: new Date().toISOString(),
    };
    
    setDoc(updatedDoc);
    saveDocument(updatedDoc);
    toast({ title: 'Período excluído', description: 'O período foi removido dos dados extraídos.' });
  };

  const handleExport = (format: 'xlsx' | 'csv') => {
    if (!doc || !doc.extractedData) return;
    
    if (format === 'xlsx') {
      exportToExcel(doc.extractedData, doc.name);
    } else {
      exportToCSV(doc.extractedData, doc.name);
    }
    
    toast({
      title: 'Exportação concluída!',
      description: `Arquivo ${format.toUpperCase()} baixado com sucesso.`,
    });
    setExportDialogOpen(false);
  };

  const handleDelete = () => {
    if (!doc) return;
    deleteDocument(doc.id);
    toast({ title: 'Documento excluído', description: 'O documento foi removido com sucesso.' });
    navigate('/documents');
  };

  const downloadOriginal = () => {
    if (!doc || doc.files.length === 0) return;
    const file = doc.files[activeFileIndex];
    const link = document.createElement('a');
    link.href = file.base64;
    link.download = file.name;
    link.click();
  };

  const renderEditableCell = (
    value: string,
    monthIndex: number,
    field: string,
    subField?: string,
    eventIndex?: number,
  ) => {
    const isEditing =
      editingCell?.monthIndex === monthIndex &&
      editingCell?.field === field &&
      editingCell?.subField === subField &&
      editingCell?.eventIndex === eventIndex;

    if (isEditing) {
      return (
        <div className="flex items-center gap-1">
          <Input
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            className="h-7 text-xs"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') saveEdit();
              if (e.key === 'Escape') cancelEdit();
            }}
          />
          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={saveEdit}>
            <Save className="h-3 w-3 text-primary" />
          </Button>
          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={cancelEdit}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      );
    }

    return (
      <span
        className="cursor-pointer hover:text-primary hover:underline"
        onClick={() => startEditing(monthIndex, field, value || '', subField, eventIndex)}
      >
        {value || '-'}
      </span>
    );
  };

  if (!doc) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/documents')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{doc.name}</h1>
            <p className="text-muted-foreground text-sm">
              {doc.description || 'Sem descrição'} • {doc.files.length} arquivo(s)
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={downloadOriginal}>
            <Download className="h-4 w-4 mr-2" />
            Download
          </Button>
          <Button variant="destructive" onClick={() => setDeleteDialogOpen(true)}>
            <Trash2 className="h-4 w-4 mr-2" />
            Excluir
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* PDF Preview */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Preview do Documento</CardTitle>
            {doc.files.length > 1 && (
              <div className="flex gap-2 mt-2">
                {doc.files.map((file, index) => (
                  <Button
                    key={file.id}
                    variant={activeFileIndex === index ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setActiveFileIndex(index)}
                  >
                    Arquivo {index + 1}
                  </Button>
                ))}
              </div>
            )}
          </CardHeader>
          <CardContent>
            <div ref={pdfContainerRef} className="rounded-lg overflow-hidden bg-muted aspect-[3/4]">
              {doc.files[activeFileIndex]?.type === 'application/pdf' ? (
                <iframe
                  src={doc.files[activeFileIndex].base64}
                  className="w-full h-full"
                  title="PDF Preview"
                />
              ) : (
                <img
                  src={doc.files[activeFileIndex]?.base64}
                  alt="Document preview"
                  className="w-full h-full object-contain"
                />
              )}
            </div>
          </CardContent>
        </Card>

        {/* Extraction Panel */}
        <div className="space-y-6">
          {/* Pattern Select + Status */}
          <Card>
            <CardContent className="pt-6 space-y-4">
              {/* Pattern selector - always visible */}
              <div className="space-y-2">
                <Label>Modelo do Holerite</Label>
                <Select value={selectedPattern} onValueChange={handlePatternChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o modelo..." />
                  </SelectTrigger>
                  <SelectContent>
                    {PATTERN_OPTIONS.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Status */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {doc.status === 'pending' && (
                    <>
                      <AlertCircle className="h-6 w-6 text-yellow-500" />
                      <div>
                        <p className="font-medium">Aguardando extração</p>
                        <p className="text-sm text-muted-foreground">Clique para extrair os dados</p>
                      </div>
                    </>
                  )}
                  {doc.status === 'extracting' && (
                    <>
                      <Loader2 className="h-6 w-6 text-primary animate-spin" />
                      <div>
                        <p className="font-medium">Extraindo dados...</p>
                        <p className="text-sm text-muted-foreground">{extractionProgress}% concluído</p>
                      </div>
                    </>
                  )}
                  {doc.status === 'extracted' && (
                    <>
                      <CheckCircle className="h-6 w-6 text-primary" />
                      <div>
                        <p className="font-medium">Dados extraídos</p>
                        <p className="text-sm text-muted-foreground">
                          {doc.extractedData?.months.length} período(s)
                          {doc.extractedData?.payslipPattern && ` • Modelo ${doc.extractedData.payslipPattern}`}
                        </p>
                      </div>
                    </>
                  )}
                  {doc.status === 'error' && (
                    <>
                      <AlertCircle className="h-6 w-6 text-destructive" />
                      <div>
                        <p className="font-medium">Erro na extração</p>
                        <p className="text-sm text-muted-foreground">Tente novamente</p>
                      </div>
                    </>
                  )}
                </div>
                
                <div className="flex gap-2">
                  {(doc.status === 'pending' || doc.status === 'error') && (
                    <Button
                      onClick={handleExtraction}
                      disabled={isExtracting}
                      className="gradient-primary text-primary-foreground"
                    >
                      {isExtracting ? (
                        <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Extraindo...</>
                      ) : 'Extrair Dados'}
                    </Button>
                  )}
                  
                  {doc.status === 'extracted' && (
                    <>
                      <Button variant="outline" size="sm" onClick={handleExtraction} disabled={isExtracting}>
                        <RefreshCw className="h-4 w-4 mr-1" />
                        Re-extrair
                      </Button>
                      <Button onClick={() => setExportDialogOpen(true)}>
                        <FileSpreadsheet className="h-4 w-4 mr-2" />
                        Exportar
                      </Button>
                    </>
                  )}
                </div>
              </div>
              
              {isExtracting && (
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full gradient-primary transition-all duration-300"
                    style={{ width: `${extractionProgress}%` }}
                  />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Extracted Data */}
          {doc.extractedData && doc.extractedData.months.map((month, monthIndex) => (
            <Card key={monthIndex}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">
                    {month.competencia || month.month}
                  </CardTitle>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-destructive"
                    onClick={() => deleteRow(monthIndex)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <CardDescription>Clique em qualquer valor para editar</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Header info */}
                <div className="grid grid-cols-2 gap-3 text-sm">
                  {[
                    { label: 'Empresa', field: 'empresa' },
                    { label: 'CNPJ', field: 'cnpj' },
                    { label: 'Centro de Custo', field: 'centroCusto' },
                    { label: 'Tipo de Folha', field: 'tipoFolha' },
                    { label: 'Cód. Funcionário', field: 'codigoFuncionario' },
                    { label: 'Nome Funcionário', field: 'nomeFuncionario' },
                    { label: 'CBO', field: 'cbo' },
                    { label: 'Departamento', field: 'departamento' },
                    { label: 'Filial', field: 'filial' },
                    { label: 'Cargo', field: 'cargo' },
                    { label: 'Data Admissão', field: 'dataAdmissao' },
                  ].map(({ label, field }) => (
                    <div key={field}>
                      <p className="text-muted-foreground text-xs">{label}</p>
                      <div className="font-medium">
                        {renderEditableCell((month as any)[field] || '', monthIndex, field)}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Events table */}
                {month.eventos && month.eventos.length > 0 && (
                  <div className="rounded-lg border overflow-auto max-h-80">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Código</TableHead>
                          <TableHead className="text-xs">Descrição</TableHead>
                          <TableHead className="text-xs">Ref.</TableHead>
                          <TableHead className="text-xs">Vencimento</TableHead>
                          <TableHead className="text-xs">Desconto</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {month.eventos.map((ev, evIdx) => (
                          <TableRow key={evIdx}>
                            <TableCell className="text-xs py-1">
                              {renderEditableCell(ev.codigo, monthIndex, 'eventos', 'codigo', evIdx)}
                            </TableCell>
                            <TableCell className="text-xs py-1">
                              {renderEditableCell(ev.descricao, monthIndex, 'eventos', 'descricao', evIdx)}
                            </TableCell>
                            <TableCell className="text-xs py-1">
                              {renderEditableCell(ev.referencia, monthIndex, 'eventos', 'referencia', evIdx)}
                            </TableCell>
                            <TableCell className="text-xs py-1">
                              {renderEditableCell(ev.vencimento, monthIndex, 'eventos', 'vencimento', evIdx)}
                            </TableCell>
                            <TableCell className="text-xs py-1">
                              {renderEditableCell(ev.desconto, monthIndex, 'eventos', 'desconto', evIdx)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}

                {/* Footer totals */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm p-3 rounded-lg bg-muted/50">
                  {[
                    { label: 'Salário Base', field: 'salarioBase' },
                    { label: 'Total Vencimentos', field: 'totalVencimentos' },
                    { label: 'Total Descontos', field: 'totalDescontos' },
                    { label: 'Valor Líquido', field: 'valorLiquido' },
                    { label: 'Base INSS', field: 'baseInss' },
                    { label: 'Base FGTS', field: 'baseFgts' },
                    { label: 'FGTS do Mês', field: 'fgtsMes' },
                    { label: 'Base IRRF', field: 'baseIrrf' },
                    { label: 'IRRF', field: 'irrf' },
                    { label: 'Banco', field: 'banco' },
                    { label: 'Agência', field: 'agencia' },
                    { label: 'Conta Corrente', field: 'contaCorrente' },
                  ].map(({ label, field }) => (
                    <div key={field}>
                      <p className="text-muted-foreground text-xs">{label}</p>
                      <div className="font-medium">
                        {renderEditableCell((month as any)[field] || '', monthIndex, field)}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Export Dialog */}
      <Dialog open={exportDialogOpen} onOpenChange={setExportDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Exportar Dados</DialogTitle>
            <DialogDescription>
              Escolha o formato de exportação
            </DialogDescription>
          </DialogHeader>
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

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar Exclusão</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja excluir este documento? Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              <Trash2 className="h-4 w-4 mr-2" />
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default DocumentDetail;
