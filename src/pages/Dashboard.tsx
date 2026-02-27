import React, { useState, useCallback, useEffect } from 'react';
import { Plus, Loader2 } from 'lucide-react';
import LordIcon from '@/components/ui/lord-icon';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { getDocuments } from '@/lib/supabase-storage';
import { Document } from '@/types';
import { useNavigate } from 'react-router-dom';
import UploadModal from '@/components/documents/UploadModal';

const Dashboard: React.FC = () => {
  const { currentUser } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  
  const [isDragging, setIsDragging] = useState(false);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [documents, setDocuments] = useState<Document[]>([]);

  useEffect(() => {
    if (currentUser) {
      getDocuments(currentUser.user_id).then(setDocuments);
    }
  }, [currentUser]);

  const recentDocs = documents.slice(0, 5);
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
      setUploadFiles(files);
      setUploadModalOpen(true);
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
      setUploadFiles(files);
      setUploadModalOpen(true);
    }
  };

  const handleUploadSuccess = (docId: string) => {
    navigate(`/documents/${docId}`);
  };

  const getStatusIcon = (status: Document['status']) => {
    switch (status) {
      case 'pending':
        return <LordIcon icon="clock" size={16} trigger="loop" delay={3000} colors={{ primary: '#eab308', secondary: '#eab308' }} />;
      case 'extracting':
        return <Loader2 className="h-4 w-4 text-primary animate-spin" />;
      case 'extracted':
        return <LordIcon icon="check" size={16} trigger="loop" delay={5000} colors={{ primary: '#08a88a', secondary: '#08a88a' }} />;
      case 'error':
        return <LordIcon icon="alert" size={16} trigger="loop" delay={3000} colors={{ primary: '#ef4444', secondary: '#ef4444' }} />;
    }
  };

  const getStatusText = (status: Document['status']) => {
    switch (status) {
      case 'pending': return 'Aguardando extração';
      case 'extracting': return 'Extraindo dados...';
      case 'extracted': return 'Dados extraídos';
      case 'error': return 'Erro na extração';
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">
          Olá, <span className="gradient-text">{currentUser?.name.split(' ')[0]}</span>!
        </h1>
        <p className="text-muted-foreground mt-1">Gerencie seus holerites e documentos trabalhistas</p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-primary/10">
                <LordIcon icon="document" size={36} trigger="loop" delay={4000} colors={{ primary: '#0d9668', secondary: '#2563eb' }} />
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
              <div className="p-3 rounded-xl bg-accent">
                <LordIcon icon="clock" size={36} trigger="loop" delay={3000} colors={{ primary: '#ca8a04', secondary: '#ca8a04' }} />
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
                <LordIcon icon="check" size={36} trigger="loop" delay={4000} colors={{ primary: '#0d9668', secondary: '#2563eb' }} />
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
          className={`relative p-8 lg:p-12 border-2 border-dashed rounded-xl transition-all duration-300 ${
            isDragging ? 'border-primary bg-primary/5 scale-[1.02]' : 'border-muted-foreground/25 hover:border-primary/50'
          }`}
        >
          <div className="flex flex-col items-center text-center">
            <div className={`p-4 rounded-2xl mb-4 transition-all duration-300 ${isDragging ? 'bg-primary scale-110' : 'gradient-primary'}`}>
              <LordIcon icon="upload" size={40} trigger="loop" delay={2000} colors={{ primary: '#ffffff', secondary: '#ffffff' }} />
            </div>
            <h3 className="text-xl font-semibold mb-2">
              {isDragging ? 'Solte os arquivos aqui!' : 'Faça upload dos seus documentos'}
            </h3>
            <p className="text-muted-foreground mb-4">Arraste e solte PDFs ou imagens aqui, ou clique para selecionar</p>
            <label>
              <input type="file" multiple accept=".pdf,image/*" className="hidden" onChange={handleFileSelect} />
              <Button variant="outline" className="cursor-pointer" asChild>
                <span><Plus className="h-4 w-4 mr-2" />Selecionar Arquivos</span>
              </Button>
            </label>
            <p className="text-xs text-muted-foreground mt-4">Formatos aceitos: PDF, JPG, PNG, JPEG</p>
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
                      <LordIcon icon="document" size={24} trigger="hover" colors={{ primary: '#0d9668', secondary: '#2563eb' }} />
                    </div>
                    <div>
                      <p className="font-medium">{doc.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {doc.files.length} arquivo(s) • {new Date(doc.created_at).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    {getStatusIcon(doc.status)}
                    <span className="text-muted-foreground hidden sm:inline">{getStatusText(doc.status)}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <div className="mx-auto mb-4 opacity-50"><LordIcon icon="document" size={48} trigger="loop" delay={3000} colors={{ primary: '#6b7280', secondary: '#6b7280' }} /></div>
              <p>Nenhum documento enviado ainda</p>
              <p className="text-sm">Faça o upload do seu primeiro holerite acima</p>
            </div>
          )}
        </CardContent>
      </Card>

      <UploadModal
        open={uploadModalOpen}
        onOpenChange={setUploadModalOpen}
        files={uploadFiles}
        setFiles={setUploadFiles}
        userId={currentUser?.user_id || ''}
        onSuccess={handleUploadSuccess}
      />
    </div>
  );
};

export default Dashboard;
