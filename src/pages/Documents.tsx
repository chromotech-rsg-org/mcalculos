import React, { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Eye, Download, FileSpreadsheet, FileText, Trash2 } from 'lucide-react';
import LordIcon from '@/components/ui/lord-icon';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import { getDocuments, deleteDocument } from '@/lib/supabase-storage';
import { Document } from '@/types';
import UploadModal from '@/components/documents/UploadModal';
import ExportColumnSelector from '@/components/documents/ExportColumnSelector';

const Documents: React.FC = () => {
  const { currentUser } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [docToDelete, setDocToDelete] = useState<string | null>(null);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportDoc, setExportDoc] = useState<Document | null>(null);

  const loadDocuments = useCallback(async () => {
    if (currentUser) {
      const docs = await getDocuments(currentUser.user_id);
      setDocuments(docs);
    }
  }, [currentUser]);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);
  
  const filteredDocs = documents.filter(doc =>
    doc.name.toLowerCase().includes(search.toLowerCase()) ||
    doc.description.toLowerCase().includes(search.toLowerCase())
  );

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === filteredDocs.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredDocs.map(d => d.id));
    }
  };

  const handleDelete = async (id?: string) => {
    const idsToDelete = id ? [id] : selectedIds;
    for (const docId of idsToDelete) {
      await deleteDocument(docId);
    }
    toast({ title: 'Documento(s) excluído(s)', description: `${idsToDelete.length} documento(s) removido(s).` });
    setSelectedIds([]);
    setDeleteDialogOpen(false);
    setDocToDelete(null);
    loadDocuments();
  };

  const confirmDelete = (id?: string) => {
    setDocToDelete(id || null);
    setDeleteDialogOpen(true);
  };

  const downloadFile = async (doc: Document) => {
    // Lazy-load full document for download
    const fullDoc = await getDocumentById(doc.id);
    if (fullDoc && fullDoc.files.length > 0) {
      const file = fullDoc.files[0];
      const link = document.createElement('a');
      link.href = file.base64;
      link.download = file.name;
      link.click();
    }
  };

  const getStatusIcon = (status: Document['status']) => {
    switch (status) {
      case 'pending': return <LordIcon icon="clock" size={16} trigger="loop" delay={3000} colors={{ primary: '#eab308', secondary: '#eab308' }} />;
      case 'extracting': return <Loader2 className="h-4 w-4 text-primary animate-spin" />;
      case 'extracted': return <LordIcon icon="check" size={20} trigger="loop" delay={5000} colors={{ primary: '#08a88a', secondary: '#08a88a' }} />;
      case 'error': return <LordIcon icon="alert" size={16} trigger="loop" delay={3000} colors={{ primary: '#ef4444', secondary: '#ef4444' }} />;
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); }, []);
  const handleDragLeave = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files).filter(file => file.type === 'application/pdf' || file.type.startsWith('image/'));
    if (files.length > 0) { setUploadFiles(files); setUploadModalOpen(true); }
    else { toast({ variant: 'destructive', title: 'Formato inválido', description: 'Apenas PDFs e imagens são aceitos.' }); }
  }, [toast]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter(file => file.type === 'application/pdf' || file.type.startsWith('image/'));
    if (files.length > 0) { setUploadFiles(files); setUploadModalOpen(true); }
    e.target.value = '';
  };

  const handleUploadSuccess = (docId: string) => {
    loadDocuments();
    navigate(`/documents/${docId}`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Meus Documentos</h1>
          <p className="text-muted-foreground mt-1">{documents.length} documento(s) no total</p>
        </div>
        <div className="flex items-center gap-2">
          {selectedIds.length > 0 && (
            <Button variant="destructive" onClick={() => confirmDelete()}>
              <LordIcon icon="trash" size={16} trigger="hover" colors={{ primary: '#ffffff', secondary: '#ffffff' }} />
              <span className="ml-2">Excluir ({selectedIds.length})</span>
            </Button>
          )}
          <label>
            <input type="file" multiple accept=".pdf,image/*" className="hidden" onChange={handleFileSelect} />
            <Button className="gradient-primary text-primary-foreground cursor-pointer" asChild>
              <span>
                <LordIcon icon="plus" size={16} trigger="hover" colors={{ primary: '#ffffff', secondary: '#ffffff' }} />
                <span className="ml-2">Novo Documento</span>
              </span>
            </Button>
          </label>
        </div>
      </div>

      <Card onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
        <div className={`relative p-6 border-2 border-dashed rounded-xl transition-all duration-300 ${isDragging ? 'border-primary bg-primary/5 scale-[1.01]' : 'border-muted-foreground/25 hover:border-primary/50'}`}>
          <div className="flex flex-col items-center text-center">
            <div className={`p-3 rounded-xl mb-3 transition-all duration-300 ${isDragging ? 'bg-primary scale-110' : 'gradient-primary'}`}>
              <LordIcon icon="upload" size={32} trigger="loop" delay={2000} colors={{ primary: '#ffffff', secondary: '#ffffff' }} />
            </div>
            <p className="text-sm text-muted-foreground">{isDragging ? 'Solte os arquivos aqui!' : 'Arraste e solte PDFs ou imagens aqui'}</p>
          </div>
        </div>
      </Card>

      <div className="relative">
        <div className="absolute left-3 top-1/2 -translate-y-1/2">
          <LordIcon icon="search" size={20} trigger="loop-on-hover" colors={{ primary: '#6b7280', secondary: '#6b7280' }} />
        </div>
        <Input placeholder="Buscar documentos..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Lista de Documentos</CardTitle>
            {filteredDocs.length > 0 && (
              <div className="flex items-center gap-2">
                <Checkbox checked={selectedIds.length === filteredDocs.length && filteredDocs.length > 0} onCheckedChange={toggleSelectAll} />
                <span className="text-sm text-muted-foreground">Selecionar todos</span>
              </div>
            )}
          </div>
          <CardDescription>Clique em um documento para visualizar e editar os dados extraídos</CardDescription>
        </CardHeader>
        <CardContent>
          {filteredDocs.length > 0 ? (
            <div className="space-y-2">
              {filteredDocs.map(doc => (
                <div key={doc.id} className="flex items-center gap-4 p-4 rounded-xl bg-muted/50 hover:bg-muted transition-colors">
                  <Checkbox checked={selectedIds.includes(doc.id)} onCheckedChange={() => toggleSelect(doc.id)} />
                  <div className="flex-1 flex items-center gap-4 cursor-pointer" onClick={() => navigate(`/documents/${doc.id}`)}>
                    <div className="p-2 rounded-lg bg-primary/10">
                      <LordIcon icon="document" size={28} trigger="hover" colors={{ primary: '#0d9668', secondary: '#0d9668' }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{doc.name}</p>
                      <p className="text-sm text-muted-foreground truncate">{doc.description || 'Sem descrição'}</p>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                        <span>{new Date(doc.created_at).toLocaleDateString('pt-BR')}</span>
                      </div>
                    </div>
                  </div>
                  <TooltipProvider delayDuration={300}>
                    <div className="flex items-center gap-1">
                      <Tooltip><TooltipTrigger asChild><span>{getStatusIcon(doc.status)}</span></TooltipTrigger>
                        <TooltipContent>
                          {doc.status === 'pending' && 'Pendente extração'}
                          {doc.status === 'extracting' && 'Extraindo...'}
                          {doc.status === 'extracted' && 'Dados já extraídos'}
                          {doc.status === 'error' && 'Erro na extração'}
                        </TooltipContent>
                      </Tooltip>
                      <Tooltip><TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); navigate(`/documents/${doc.id}`); }}><Eye className="h-5 w-5 text-primary" /></Button>
                      </TooltipTrigger><TooltipContent>Ver</TooltipContent></Tooltip>
                      <Tooltip><TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); downloadFile(doc); }}><Download className="h-5 w-5 text-secondary" /></Button>
                      </TooltipTrigger><TooltipContent>Baixar PDF</TooltipContent></Tooltip>
                      <Tooltip><TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" disabled={doc.status !== 'extracted'} onClick={(e) => {
                          e.stopPropagation();
                          if (doc.extracted_data) { setExportDoc(doc); setExportDialogOpen(true); }
                        }}><FileSpreadsheet className="h-5 w-5 text-emerald-600" /></Button>
                      </TooltipTrigger><TooltipContent>Exportar dados</TooltipContent></Tooltip>
                      <Tooltip><TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); confirmDelete(doc.id); }}><Trash2 className="h-5 w-5 text-destructive" /></Button>
                      </TooltipTrigger><TooltipContent>Excluir</TooltipContent></Tooltip>
                    </div>
                  </TooltipProvider>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <div className="mx-auto mb-4 opacity-50"><LordIcon icon="document" size={64} trigger="loop" delay={3000} colors={{ primary: '#6b7280', secondary: '#6b7280' }} /></div>
              <p className="text-lg font-medium">Nenhum documento encontrado</p>
              <p className="text-sm">{search ? 'Tente uma busca diferente' : 'Faça o upload do seu primeiro documento'}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar Exclusão</DialogTitle>
            <DialogDescription>
              {docToDelete ? 'Tem certeza que deseja excluir este documento?' : `Tem certeza que deseja excluir ${selectedIds.length} documento(s)?`} Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={() => handleDelete(docToDelete || undefined)}>Excluir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <UploadModal open={uploadModalOpen} onOpenChange={setUploadModalOpen} files={uploadFiles} setFiles={setUploadFiles} userId={currentUser?.user_id || ''} onSuccess={handleUploadSuccess} />
      
      {exportDoc?.extracted_data && (
        <ExportColumnSelector open={exportDialogOpen} onOpenChange={setExportDialogOpen} data={exportDoc.extracted_data} filename={exportDoc.name} />
      )}
    </div>
  );
};

export default Documents;
