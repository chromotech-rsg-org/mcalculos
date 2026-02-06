import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Search, Trash2, Download, Eye, CheckCircle, Clock, AlertCircle, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { getDocuments, deleteDocument } from '@/lib/storage';
import { Document } from '@/types';

const Documents: React.FC = () => {
  const { currentUser } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [docToDelete, setDocToDelete] = useState<string | null>(null);

  const documents = currentUser ? getDocuments(currentUser.id) : [];
  
  const filteredDocs = documents.filter(doc =>
    doc.name.toLowerCase().includes(search.toLowerCase()) ||
    doc.description.toLowerCase().includes(search.toLowerCase())
  );

  const toggleSelect = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === filteredDocs.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredDocs.map(d => d.id));
    }
  };

  const handleDelete = (id?: string) => {
    const idsToDelete = id ? [id] : selectedIds;
    
    idsToDelete.forEach(docId => deleteDocument(docId));
    
    toast({
      title: 'Documento(s) excluído(s)',
      description: `${idsToDelete.length} documento(s) removido(s).`,
    });
    
    setSelectedIds([]);
    setDeleteDialogOpen(false);
    setDocToDelete(null);
  };

  const confirmDelete = (id?: string) => {
    setDocToDelete(id || null);
    setDeleteDialogOpen(true);
  };

  const downloadFile = (doc: Document) => {
    if (doc.files.length > 0) {
      const file = doc.files[0];
      const link = document.createElement('a');
      link.href = file.base64;
      link.download = file.name;
      link.click();
    }
  };

  const getStatusIcon = (status: Document['status']) => {
    switch (status) {
      case 'pending':
        return <Clock className="h-4 w-4 text-yellow-500" />;
      case 'extracting':
        return <Loader2 className="h-4 w-4 text-primary animate-spin" />;
      case 'extracted':
        return <CheckCircle className="h-4 w-4 text-primary" />;
      case 'error':
        return <AlertCircle className="h-4 w-4 text-destructive" />;
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Meus Documentos</h1>
          <p className="text-muted-foreground mt-1">
            {documents.length} documento(s) no total
          </p>
        </div>
        
        {selectedIds.length > 0 && (
          <Button
            variant="destructive"
            onClick={() => confirmDelete()}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Excluir ({selectedIds.length})
          </Button>
        )}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
        <Input
          placeholder="Buscar documentos..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Documents List */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Lista de Documentos</CardTitle>
            {filteredDocs.length > 0 && (
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={selectedIds.length === filteredDocs.length && filteredDocs.length > 0}
                  onCheckedChange={toggleSelectAll}
                />
                <span className="text-sm text-muted-foreground">Selecionar todos</span>
              </div>
            )}
          </div>
          <CardDescription>
            Clique em um documento para visualizar e editar os dados extraídos
          </CardDescription>
        </CardHeader>
        <CardContent>
          {filteredDocs.length > 0 ? (
            <div className="space-y-2">
              {filteredDocs.map(doc => (
                <div
                  key={doc.id}
                  className="flex items-center gap-4 p-4 rounded-xl bg-muted/50 hover:bg-muted transition-colors"
                >
                  <Checkbox
                    checked={selectedIds.includes(doc.id)}
                    onCheckedChange={() => toggleSelect(doc.id)}
                  />
                  
                  <div
                    className="flex-1 flex items-center gap-4 cursor-pointer"
                    onClick={() => navigate(`/documents/${doc.id}`)}
                  >
                    <div className="p-2 rounded-lg bg-primary/10">
                      <FileText className="h-5 w-5 text-primary" />
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{doc.name}</p>
                      <p className="text-sm text-muted-foreground truncate">
                        {doc.description || 'Sem descrição'}
                      </p>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                        <span>{doc.files.length} arquivo(s)</span>
                        <span>•</span>
                        <span>{formatFileSize(doc.files.reduce((acc, f) => acc + f.size, 0))}</span>
                        <span>•</span>
                        <span>{new Date(doc.createdAt).toLocaleDateString('pt-BR')}</span>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-1">
                      {getStatusIcon(doc.status)}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/documents/${doc.id}`);
                      }}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        downloadFile(doc);
                      }}
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        confirmDelete(doc.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="h-16 w-16 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium">Nenhum documento encontrado</p>
              <p className="text-sm">
                {search ? 'Tente uma busca diferente' : 'Faça o upload do seu primeiro documento'}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar Exclusão</DialogTitle>
            <DialogDescription>
              {docToDelete
                ? 'Tem certeza que deseja excluir este documento? Esta ação não pode ser desfeita.'
                : `Tem certeza que deseja excluir ${selectedIds.length} documento(s)? Esta ação não pode ser desfeita.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={() => handleDelete(docToDelete || undefined)}>
              <Trash2 className="h-4 w-4 mr-2" />
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Documents;
