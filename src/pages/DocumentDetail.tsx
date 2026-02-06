import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, FileText, Download, Trash2, Edit2, Save, X, Loader2, FileSpreadsheet, AlertCircle, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { getDocumentById, saveDocument, deleteDocument } from '@/lib/storage';
import { Document, ExtractedData, ExtractedMonth } from '@/types';
import { extractDataFromPDF, extractDataFromImage } from '@/lib/extraction';
import { exportToExcel, exportToCSV } from '@/lib/export';

const DocumentDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [doc, setDoc] = useState<Document | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionProgress, setExtractionProgress] = useState(0);
  const [editingCell, setEditingCell] = useState<{ month: number; field: number } | null>(null);
  const [editValue, setEditValue] = useState('');
  const [selectedFields, setSelectedFields] = useState<string[]>([]);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [activeFileIndex, setActiveFileIndex] = useState(0);
  
  const pdfContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (id) {
      const document = getDocumentById(id);
      if (document) {
        setDoc(document);
        if (document.extractedData) {
          const allFields = document.extractedData.months.flatMap(m => m.fields.map(f => f.key));
          setSelectedFields([...new Set(allFields)]);
        }
      } else {
        navigate('/documents');
      }
    }
  }, [id, navigate]);

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
      
      for (let i = 0; i < doc.files.length; i++) {
        const file = doc.files[i];
        setExtractionProgress(Math.round(((i + 1) / doc.files.length) * 100));
        
        let extractedData: ExtractedData;
        
        if (file.type === 'application/pdf') {
          extractedData = await extractDataFromPDF(file.base64);
        } else {
          extractedData = await extractDataFromImage(file.base64);
        }
        
        if (extractedData.employeeName) employeeName = extractedData.employeeName;
        if (extractedData.cnpj) cnpj = extractedData.cnpj;
        documentType = extractedData.documentType;
        allMonths = [...allMonths, ...extractedData.months];
      }
      
      const finalData: ExtractedData = {
        employeeName,
        cnpj,
        documentType,
        months: allMonths,
        extractedAt: new Date().toISOString(),
      };
      
      const finalDoc = {
        ...doc,
        extractedData: finalData,
        status: 'extracted' as const,
        updatedAt: new Date().toISOString(),
      };
      
      setDoc(finalDoc);
      saveDocument(finalDoc);
      
      const allFields = allMonths.flatMap(m => m.fields.map(f => f.key));
      setSelectedFields([...new Set(allFields)]);
      
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

  const startEditing = (monthIndex: number, fieldIndex: number, currentValue: string) => {
    setEditingCell({ month: monthIndex, field: fieldIndex });
    setEditValue(currentValue);
  };

  const saveEdit = () => {
    if (!doc || !doc.extractedData || !editingCell) return;
    
    const updatedMonths = [...doc.extractedData.months];
    updatedMonths[editingCell.month].fields[editingCell.field].value = editValue;
    
    const updatedDoc = {
      ...doc,
      extractedData: { ...doc.extractedData, months: updatedMonths },
      updatedAt: new Date().toISOString(),
    };
    
    setDoc(updatedDoc);
    saveDocument(updatedDoc);
    setEditingCell(null);
    
    toast({
      title: 'Salvo!',
      description: 'Alteração salva com sucesso.',
    });
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
    
    toast({
      title: 'Linha excluída',
      description: 'O período foi removido dos dados extraídos.',
    });
  };

  const handleExport = (format: 'xlsx' | 'csv') => {
    if (!doc || !doc.extractedData) return;
    
    const filteredData = {
      ...doc.extractedData,
      months: doc.extractedData.months.map(month => ({
        ...month,
        fields: month.fields.filter(f => selectedFields.includes(f.key)),
      })),
    };
    
    if (format === 'xlsx') {
      exportToExcel(filteredData, doc.name);
    } else {
      exportToCSV(filteredData, doc.name);
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
    toast({
      title: 'Documento excluído',
      description: 'O documento foi removido com sucesso.',
    });
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

  const toggleFieldSelection = (field: string) => {
    setSelectedFields(prev =>
      prev.includes(field) ? prev.filter(f => f !== field) : [...prev, field]
    );
  };

  const getAllFields = useCallback((): string[] => {
    if (!doc?.extractedData) return [];
    const fields = doc.extractedData.months.flatMap(m => m.fields.map(f => f.key));
    return [...new Set(fields)];
  }, [doc]);

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
          {/* Status Card */}
          <Card>
            <CardContent className="pt-6">
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
                
                {(doc.status === 'pending' || doc.status === 'error') && (
                  <Button
                    onClick={handleExtraction}
                    disabled={isExtracting}
                    className="gradient-primary text-primary-foreground"
                  >
                    {isExtracting ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Extraindo...
                      </>
                    ) : (
                      'Extrair Dados'
                    )}
                  </Button>
                )}
                
                {doc.status === 'extracted' && (
                  <Button onClick={() => setExportDialogOpen(true)}>
                    <FileSpreadsheet className="h-4 w-4 mr-2" />
                    Exportar
                  </Button>
                )}
              </div>
              
              {isExtracting && (
                <div className="mt-4">
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full gradient-primary transition-all duration-300"
                      style={{ width: `${extractionProgress}%` }}
                    />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Extracted Data */}
          {doc.extractedData && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Dados Extraídos</CardTitle>
                <CardDescription>
                  Clique em um valor para editar
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {/* Employee Info */}
                  <div className="grid grid-cols-2 gap-4 p-4 rounded-lg bg-muted/50">
                    <div>
                      <p className="text-sm text-muted-foreground">Funcionário</p>
                      <p className="font-medium">{doc.extractedData.employeeName || 'Não identificado'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">CNPJ</p>
                      <p className="font-medium">{doc.extractedData.cnpj || 'Não identificado'}</p>
                    </div>
                  </div>

                  {/* Data Table */}
                  <div className="rounded-lg border overflow-auto max-h-96">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="sticky left-0 bg-background">Período</TableHead>
                          <TableHead>Campo</TableHead>
                          <TableHead>Valor</TableHead>
                          <TableHead className="w-20">Ações</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {doc.extractedData.months.map((month, monthIndex) => (
                          <React.Fragment key={monthIndex}>
                            {month.fields.map((field, fieldIndex) => (
                              <TableRow key={`${monthIndex}-${fieldIndex}`}>
                                {fieldIndex === 0 && (
                                  <TableCell
                                    rowSpan={month.fields.length}
                                    className="sticky left-0 bg-background font-medium"
                                  >
                                    {month.month}
                                  </TableCell>
                                )}
                                <TableCell className="text-muted-foreground">{field.key}</TableCell>
                                <TableCell>
                                  {editingCell?.month === monthIndex && editingCell?.field === fieldIndex ? (
                                    <div className="flex items-center gap-2">
                                      <Input
                                        value={editValue}
                                        onChange={(e) => setEditValue(e.target.value)}
                                        className="h-8"
                                        autoFocus
                                      />
                                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={saveEdit}>
                                        <Save className="h-4 w-4 text-primary" />
                                      </Button>
                                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={cancelEdit}>
                                        <X className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  ) : (
                                    <span
                                      className="cursor-pointer hover:text-primary"
                                      onClick={() => startEditing(monthIndex, fieldIndex, field.value)}
                                    >
                                      {field.value}
                                    </span>
                                  )}
                                </TableCell>
                                {fieldIndex === 0 && (
                                  <TableCell rowSpan={month.fields.length}>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="h-8 w-8 text-destructive"
                                      onClick={() => deleteRow(monthIndex)}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </TableCell>
                                )}
                              </TableRow>
                            ))}
                          </React.Fragment>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Export Dialog */}
      <Dialog open={exportDialogOpen} onOpenChange={setExportDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Exportar Dados</DialogTitle>
            <DialogDescription>
              Selecione os campos que deseja incluir na exportação
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto">
              {getAllFields().map(field => (
                <div key={field} className="flex items-center gap-2">
                  <Checkbox
                    id={field}
                    checked={selectedFields.includes(field)}
                    onCheckedChange={() => toggleFieldSelection(field)}
                  />
                  <Label htmlFor={field} className="text-sm truncate">{field}</Label>
                </div>
              ))}
            </div>
          </div>
          
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
