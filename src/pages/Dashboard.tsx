import React, { useState, useCallback } from 'react';
import { Upload, FileText, Clock, CheckCircle, AlertCircle, Plus, X, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { getDocuments, saveDocument, generateId, getStorageUsage } from '@/lib/storage';
import { Document, DocumentFile } from '@/types';
import { useNavigate } from 'react-router-dom';

const Dashboard: React.FC = () => {
  const { currentUser } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  
  const [isDragging, setIsDragging] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [docName, setDocName] = useState('');
  const [docDescription, setDocDescription] = useState('');
  const [isUploading, setIsUploading] = useState(false);

  const documents = currentUser ? getDocuments(currentUser.id) : [];
  const recentDocs = documents.slice(-5).reverse();
  const pendingCount = documents.filter(d => d.status === 'pending').length;
  const extractedCount = documents.filter(d => d.status === 'extracted').length;

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = Array.from(e.dataTransfer.files).filter(
      file => file.type === 'application/pdf' || file.type.startsWith('image/')
    );
    
    if (files.length > 0) {
      setUploadedFiles(files);
      setShowUploadModal(true);
    } else {
      toast({
        variant: 'destructive',
        title: 'Formato inválido',
        description: 'Apenas PDFs e imagens são aceitos.',
      });
    }
  }, [toast]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter(
      file => file.type === 'application/pdf' || file.type.startsWith('image/')
    );
    
    if (files.length > 0) {
      setUploadedFiles(files);
      setShowUploadModal(true);
    }
  };

  const convertToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = error => reject(error);
    });
  };

  const handleUpload = async () => {
    if (!docName.trim()) {
      toast({
        variant: 'destructive',
        title: 'Nome obrigatório',
        description: 'Digite um nome para o documento.',
      });
      return;
    }

    // Check for duplicates
    const existingDoc = documents.find(d => d.name.toLowerCase() === docName.toLowerCase());
    if (existingDoc) {
      toast({
        variant: 'destructive',
        title: 'Nome duplicado',
        description: 'Já existe um documento com este nome.',
      });
      return;
    }

    // Check storage
    const storage = getStorageUsage();
    if (storage.percentage > 90) {
      toast({
        variant: 'destructive',
        title: 'Armazenamento cheio',
        description: 'O armazenamento local está quase cheio. Exclua alguns documentos.',
      });
      return;
    }

    setIsUploading(true);

    try {
      const docFiles: DocumentFile[] = await Promise.all(
        uploadedFiles.map(async (file) => ({
          id: generateId(),
          name: file.name,
          type: file.type,
          size: file.size,
          base64: await convertToBase64(file),
          uploadedAt: new Date().toISOString(),
        }))
      );

      const newDoc: Document = {
        id: generateId(),
        userId: currentUser!.id,
        name: docName,
        description: docDescription,
        files: docFiles,
        extractedData: null,
        status: 'pending',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      saveDocument(newDoc);

      toast({
        title: 'Upload concluído!',
        description: `${uploadedFiles.length} arquivo(s) enviado(s) com sucesso.`,
      });

      setShowUploadModal(false);
      setUploadedFiles([]);
      setDocName('');
      setDocDescription('');
      
      // Navigate to document page for extraction
      navigate(`/documents/${newDoc.id}`);
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Erro no upload',
        description: 'Ocorreu um erro ao processar os arquivos.',
      });
    }

    setIsUploading(false);
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

  const getStatusText = (status: Document['status']) => {
    switch (status) {
      case 'pending':
        return 'Aguardando extração';
      case 'extracting':
        return 'Extraindo dados...';
      case 'extracted':
        return 'Dados extraídos';
      case 'error':
        return 'Erro na extração';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">
          Olá, <span className="gradient-text">{currentUser?.name.split(' ')[0]}</span>!
        </h1>
        <p className="text-muted-foreground mt-1">
          Gerencie seus holerites e documentos trabalhistas
        </p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-primary/10">
                <FileText className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{documents.length}</p>
                <p className="text-sm text-muted-foreground">Total de Documentos</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-yellow-500/10">
                <Clock className="h-6 w-6 text-yellow-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{pendingCount}</p>
                <p className="text-sm text-muted-foreground">Pendentes</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-primary/10">
                <CheckCircle className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{extractedCount}</p>
                <p className="text-sm text-muted-foreground">Extraídos</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Upload Zone */}
      <Card className="overflow-hidden">
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`
            relative p-8 lg:p-12 border-2 border-dashed rounded-xl transition-all duration-300
            ${isDragging 
              ? 'border-primary bg-primary/5 scale-[1.02]' 
              : 'border-muted-foreground/25 hover:border-primary/50'}
          `}
        >
          <div className="flex flex-col items-center text-center">
            <div className={`
              p-4 rounded-2xl mb-4 transition-all duration-300
              ${isDragging ? 'bg-primary scale-110' : 'gradient-primary'}
            `}>
              <Upload className="h-8 w-8 text-primary-foreground" />
            </div>
            
            <h3 className="text-xl font-semibold mb-2">
              {isDragging ? 'Solte os arquivos aqui!' : 'Faça upload dos seus documentos'}
            </h3>
            <p className="text-muted-foreground mb-4">
              Arraste e solte PDFs ou imagens aqui, ou clique para selecionar
            </p>
            
            <label>
              <input
                type="file"
                multiple
                accept=".pdf,image/*"
                className="hidden"
                onChange={handleFileSelect}
              />
              <Button variant="outline" className="cursor-pointer" asChild>
                <span>
                  <Plus className="h-4 w-4 mr-2" />
                  Selecionar Arquivos
                </span>
              </Button>
            </label>
            
            <p className="text-xs text-muted-foreground mt-4">
              Formatos aceitos: PDF, JPG, PNG, JPEG
            </p>
          </div>
        </div>
      </Card>

      {/* Recent Documents */}
      <Card>
        <CardHeader>
          <CardTitle>Documentos Recentes</CardTitle>
          <CardDescription>Seus últimos documentos enviados</CardDescription>
        </CardHeader>
        <CardContent>
          {recentDocs.length > 0 ? (
            <div className="space-y-3">
              {recentDocs.map(doc => (
                <div
                  key={doc.id}
                  onClick={() => navigate(`/documents/${doc.id}`)}
                  className="flex items-center justify-between p-4 rounded-xl bg-muted/50 hover:bg-muted cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="p-2 rounded-lg bg-primary/10">
                      <FileText className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium">{doc.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {doc.files.length} arquivo(s) • {new Date(doc.createdAt).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    {getStatusIcon(doc.status)}
                    <span className="text-muted-foreground hidden sm:inline">
                      {getStatusText(doc.status)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Nenhum documento enviado ainda</p>
              <p className="text-sm">Faça o upload do seu primeiro holerite acima</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Upload Modal */}
      <Dialog open={showUploadModal} onOpenChange={setShowUploadModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo Documento</DialogTitle>
            <DialogDescription>
              Preencha as informações do documento
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Selected files */}
            <div className="space-y-2">
              <Label>Arquivos selecionados</Label>
              <div className="space-y-2 max-h-32 overflow-y-auto">
                {uploadedFiles.map((file, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-2 rounded-lg bg-muted"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <FileText className="h-4 w-4 text-primary shrink-0" />
                      <span className="text-sm truncate">{file.name}</span>
                    </div>
                    <button
                      onClick={() => setUploadedFiles(files => files.filter((_, i) => i !== index))}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="docName">Nome do Documento *</Label>
              <Input
                id="docName"
                placeholder="Ex: Holerite Janeiro 2024"
                value={docName}
                onChange={(e) => setDocName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="docDescription">Descrição</Label>
              <Textarea
                id="docDescription"
                placeholder="Descrição opcional..."
                value={docDescription}
                onChange={(e) => setDocDescription(e.target.value)}
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowUploadModal(false)}
              disabled={isUploading}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleUpload}
              disabled={isUploading || uploadedFiles.length === 0}
              className="gradient-primary text-primary-foreground"
            >
              {isUploading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Enviando...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Enviar
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Dashboard;
