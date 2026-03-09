import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, FileText, Download, Trash2, Edit2, Save, X, Loader2, FileSpreadsheet, AlertCircle, CheckCircle, RefreshCw, LayoutList, ClipboardCheck } from 'lucide-react';
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
import { getDocumentById, saveDocument, deleteDocument } from '@/lib/supabase-storage';
import { Document, ExtractedData, ExtractedMonth } from '@/types';
import { buildTabsFromMonths } from '@/lib/build-tabs';
import { extractDataFromPDF, extractDataFromImage } from '@/lib/extraction';
import { exportToExcel, exportToCSV } from '@/lib/export';
import DataTableView from '@/components/documents/DataTableView';
import ExportColumnSelector from '@/components/documents/ExportColumnSelector';
import ValidationView from '@/components/documents/ValidationView';

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
  const [pdfBlobUrls, setPdfBlobUrls] = useState<Record<number, string>>({});

  useEffect(() => {
    if (id) {
      getDocumentById(id).then(document => {
        if (document) {
          setDoc(document);
          setSelectedPattern(document.payslip_pattern || document.extracted_data?.payslipPattern || 'auto');
        } else {
          navigate('/documents');
        }
      });
    }
  }, [id, navigate]);

  // Convert base64 PDF data to Blob URLs for reliable iframe rendering
  useEffect(() => {
    if (!doc) return;
    const urls: Record<number, string> = {};
    doc.files.forEach((file, index) => {
      if (file.type === 'application/pdf' && file.base64) {
        try {
          const base64 = file.base64.includes(',') ? file.base64.split(',')[1] : file.base64;
          const binary = atob(base64);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
          }
          const blob = new Blob([bytes], { type: 'application/pdf' });
          urls[index] = URL.createObjectURL(blob);
        } catch (e) {
          console.warn('Failed to create blob URL for file', index, e);
        }
      }
    });
    setPdfBlobUrls(urls);
    return () => {
      Object.values(urls).forEach(url => URL.revokeObjectURL(url));
    };
  }, [doc?.id, doc?.files.length]);

  const handlePatternChange = (value: string) => {
    setSelectedPattern(value);
    if (doc) {
      const updatedDoc = {
        ...doc,
        payslip_pattern: value !== 'auto' ? value : undefined,
        updated_at: new Date().toISOString(),
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
    await saveDocument(updatedDoc);
    
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
        extracted_data: finalData,
        payslip_pattern: detectedPattern || doc.payslip_pattern,
        status: 'extracted' as const,
        updated_at: new Date().toISOString(),
      };
      
      setDoc(finalDoc);
      await saveDocument(finalDoc);
      
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
      await saveDocument(errorDoc);
      
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
    if (!doc || !doc.extracted_data || !editingCell) return;
    
    const updatedMonths = [...doc.extracted_data.months];
    const month = { ...updatedMonths[editingCell.monthIndex] };
    
    if (editingCell.eventIndex !== undefined && editingCell.subField && month.eventos) {
      const eventos = [...month.eventos];
      eventos[editingCell.eventIndex] = {
        ...eventos[editingCell.eventIndex],
        [editingCell.subField]: editValue,
      };
      month.eventos = eventos;
    } else if (editingCell.field.startsWith('fields.')) {
      const parts = editingCell.field.split('.');
      const fieldIdx = parseInt(parts[1], 10);
      if (month.fields && month.fields[fieldIdx]) {
        const updatedFields = [...month.fields];
        updatedFields[fieldIdx] = { ...updatedFields[fieldIdx], value: editValue };
        month.fields = updatedFields;
      }
    } else {
      (month as any)[editingCell.field] = editValue;
    }
    
    updatedMonths[editingCell.monthIndex] = month;
    
    const updatedDoc = {
      ...doc,
      extracted_data: { ...doc.extracted_data, months: updatedMonths },
      updated_at: new Date().toISOString(),
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
    if (!doc || !doc.extracted_data) return;
    
    const updatedMonths = doc.extracted_data.months.filter((_, i) => i !== monthIndex);
    const updatedDoc = {
      ...doc,
      extracted_data: { ...doc.extracted_data, months: updatedMonths },
      updated_at: new Date().toISOString(),
    };
    
    setDoc(updatedDoc);
    saveDocument(updatedDoc);
    toast({ title: 'Período excluído', description: 'O período foi removido dos dados extraídos.' });
  };

  const handleExport = (format: 'xlsx' | 'csv') => {
    if (!doc || !doc.extracted_data) return;
    
    if (format === 'xlsx') {
      exportToExcel(doc.extracted_data, doc.name);
    } else {
      exportToCSV(doc.extracted_data, doc.name);
    }
    
    toast({
      title: 'Exportação concluída!',
      description: `Arquivo ${format.toUpperCase()} baixado com sucesso.`,
    });
  };

  const handleDelete = async () => {
    if (!doc) return;
    await deleteDocument(doc.id);
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
        {value || '-' }
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
    <div className="space-y-4">
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

      {/* Pattern Select + Status */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-end gap-4">
            <div className="space-y-2 sm:w-64">
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

            <div className="flex items-center gap-3 flex-1">
              {doc.status === 'pending' && (
                <>
                  <AlertCircle className="h-5 w-5 text-yellow-500 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="font-medium text-sm">Aguardando extração</p>
                    <p className="text-xs text-muted-foreground">Clique para extrair os dados</p>
                  </div>
                </>
              )}
              {doc.status === 'extracting' && (
                <>
                  <Loader2 className="h-5 w-5 text-primary animate-spin flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="font-medium text-sm">Extraindo dados...</p>
                    <p className="text-xs text-muted-foreground">{extractionProgress}% concluído</p>
                  </div>
                </>
              )}
              {doc.status === 'extracted' && (
                <>
                  <CheckCircle className="h-5 w-5 text-primary flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="font-medium text-sm">Dados extraídos</p>
                    <p className="text-xs text-muted-foreground">
                      {doc.extracted_data?.months.length} período(s)
                      {doc.extracted_data?.payslipPattern && ` • Modelo ${doc.extracted_data.payslipPattern}`}
                    </p>
                  </div>
                </>
              )}
              {doc.status === 'error' && (
                <>
                  <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="font-medium text-sm">Erro na extração</p>
                    <p className="text-xs text-muted-foreground">Tente novamente</p>
                  </div>
                </>
              )}
            </div>
            
            <div className="flex gap-2 flex-shrink-0">
              {(doc.status === 'pending' || doc.status === 'error') && (
                <Button onClick={handleExtraction} disabled={isExtracting} className="gradient-primary text-primary-foreground">
                  {isExtracting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Extraindo...</> : 'Extrair Dados'}
                </Button>
              )}
              
              {doc.status === 'extracted' && (
                <>
                  <Button variant="outline" size="sm" onClick={handleExtraction} disabled={isExtracting}>
                    <RefreshCw className="h-4 w-4 mr-1" />Re-extrair
                  </Button>
                  <Button onClick={() => setExportDialogOpen(true)}>
                    <FileSpreadsheet className="h-4 w-4 mr-2" />Exportar
                  </Button>
                </>
              )}
            </div>
          </div>
          
          {isExtracting && (
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div className="h-full gradient-primary transition-all duration-300" style={{ width: `${extractionProgress}%` }} />
            </div>
          )}
        </CardContent>
      </Card>

      {/* View mode tabs */}
      <Tabs defaultValue="detail" className="space-y-4">
        <TabsList>
          <TabsTrigger value="detail"><FileText className="h-4 w-4 mr-1" />Detalhado</TabsTrigger>
          <TabsTrigger value="table"><LayoutList className="h-4 w-4 mr-1" />Lista</TabsTrigger>
          {doc.extracted_data && (
            <TabsTrigger value="validate"><ClipboardCheck className="h-4 w-4 mr-1" />Validar</TabsTrigger>
          )}
        </TabsList>

        {/* Detalhado: side by side PDF + Extracted Data */}
        <TabsContent value="detail" className="mt-0">
          <div className="grid lg:grid-cols-2 gap-4" style={{ height: 'calc(100vh - 340px)' }}>
            {/* PDF Preview */}
            <Card className="flex flex-col overflow-hidden">
              <CardHeader className="py-3 flex-shrink-0">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Preview</CardTitle>
                  {doc.files.length > 1 && (
                    <div className="flex items-center gap-2">
                      {doc.files.map((file, idx) => (
                        <Button
                          key={idx}
                          size="sm"
                          variant={activeFileIndex === idx ? 'default' : 'outline'}
                          className="h-7 text-xs"
                          onClick={() => setActiveFileIndex(idx)}
                        >
                          {idx + 1}
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent className="flex-1 p-3 pt-0">
                <div ref={pdfContainerRef} className="h-full rounded-lg overflow-hidden border">
                  {doc.files[activeFileIndex]?.type === 'application/pdf' ? (
                    pdfBlobUrls[activeFileIndex] ? (
                      <iframe
                        src={pdfBlobUrls[activeFileIndex]}
                        className="w-full h-full"
                        title="PDF Preview"
                      />
                    ) : (
                      <div className="flex items-center justify-center h-full">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                      </div>
                    )
                  ) : doc.files[activeFileIndex]?.type.startsWith('image/') ? (
                    <img
                      src={doc.files[activeFileIndex].base64}
                      alt="Document preview"
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full text-muted-foreground">
                      <p>Visualização não disponível</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Extracted Data */}
            <Card className="flex flex-col overflow-hidden">
              <CardHeader className="py-3 flex-shrink-0">
                <CardTitle className="text-base">Dados Extraídos</CardTitle>
              </CardHeader>
              <CardContent className="flex-1 overflow-auto p-3 pt-0">
                {doc.extracted_data ? (
                  <div className="space-y-4">
                    <CardDescription className="text-xs">Clique em qualquer valor para editar</CardDescription>
                    {doc.extracted_data.months.map((month, monthIndex) => (
                      <div key={monthIndex} className="space-y-4">
                        <div className="flex items-center justify-between">
                          <h3 className="font-semibold text-sm">{month.competencia || month.month}</h3>
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => deleteRow(monthIndex)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>

                        {month.fields && month.fields.length > 0 && (
                          <div className="grid grid-cols-2 gap-2 text-sm">
                            {month.fields.map((field, fieldIdx) => (
                              <div key={`${field.key}-${fieldIdx}`}>
                                <p className="text-muted-foreground text-xs">{field.key}</p>
                                <div className="font-medium text-xs">
                                  {renderEditableCell(field.value, monthIndex, `fields.${fieldIdx}.value`)}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {month.eventos && month.eventos.length > 0 && (
                          <div className="mt-2">
                            <p className="text-xs font-semibold text-muted-foreground mb-1">Eventos ({month.eventos.length})</p>
                            <div className="rounded border overflow-auto max-h-48">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead className="text-xs py-1">Cód</TableHead>
                                    <TableHead className="text-xs py-1">Descrição</TableHead>
                                    <TableHead className="text-xs py-1">Ref</TableHead>
                                    <TableHead className="text-xs py-1">Venc.</TableHead>
                                    <TableHead className="text-xs py-1">Desc.</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {month.eventos.map((ev, evIdx) => (
                                    <TableRow key={evIdx}>
                                      <TableCell className="text-xs py-1">{renderEditableCell(ev.codigo, monthIndex, 'eventos', 'codigo', evIdx)}</TableCell>
                                      <TableCell className="text-xs py-1">{renderEditableCell(ev.descricao, monthIndex, 'eventos', 'descricao', evIdx)}</TableCell>
                                      <TableCell className="text-xs py-1">{renderEditableCell(ev.referencia, monthIndex, 'eventos', 'referencia', evIdx)}</TableCell>
                                      <TableCell className="text-xs py-1">{renderEditableCell(ev.vencimento, monthIndex, 'eventos', 'vencimento', evIdx)}</TableCell>
                                      <TableCell className="text-xs py-1">{renderEditableCell(ev.desconto, monthIndex, 'eventos', 'desconto', evIdx)}</TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          </div>
                        )}
                        {monthIndex < (doc.extracted_data?.months.length || 0) - 1 && <hr className="border-border" />}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                    <p>Extraia os dados para visualizá-los aqui</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="table" className="mt-0">
          {doc.extracted_data ? (
            <Card><CardContent className="p-4"><DataTableView data={doc.extracted_data} /></CardContent></Card>
          ) : (
            <Card><CardContent className="flex items-center justify-center h-64 text-muted-foreground text-sm"><p>Extraia os dados para visualizá-los aqui</p></CardContent></Card>
          )}
        </TabsContent>

        <TabsContent value="validate" className="mt-0">
          {doc.extracted_data ? (
            <Card>
              <CardContent className="p-4">
                <ValidationView
                  data={doc.extracted_data}
                  onUpdate={(updatedData) => {
                    const updatedDoc = {
                      ...doc,
                      extracted_data: updatedData,
                      updated_at: new Date().toISOString(),
                    };
                    setDoc(updatedDoc);
                    saveDocument(updatedDoc);
                  }}
                />
              </CardContent>
            </Card>
          ) : (
            <Card><CardContent className="flex items-center justify-center h-64 text-muted-foreground text-sm"><p>Extraia os dados para validá-los aqui</p></CardContent></Card>
          )}
        </TabsContent>
      </Tabs>

      {doc.extracted_data && (
        <ExportColumnSelector open={exportDialogOpen} onOpenChange={setExportDialogOpen} data={doc.extracted_data} filename={doc.name} />
      )}

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar Exclusão</DialogTitle>
            <DialogDescription>Tem certeza que deseja excluir este documento? Esta ação não pode ser desfeita.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDelete}><Trash2 className="h-4 w-4 mr-2" />Excluir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default DocumentDetail;
