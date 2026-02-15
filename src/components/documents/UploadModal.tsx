import React, { useState, useEffect } from 'react';
import { Upload, FileText, X, Loader2, FolderPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useToast } from '@/hooks/use-toast';
import { getDocuments, saveDocument, generateId, getStorageUsage } from '@/lib/storage';
import { Document, DocumentFile } from '@/types';

interface UploadModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  files: File[];
  setFiles: (files: File[]) => void;
  userId: string;
  onSuccess: (docId: string) => void;
}

const UploadModal: React.FC<UploadModalProps> = ({
  open,
  onOpenChange,
  files,
  setFiles,
  userId,
  onSuccess,
}) => {
  const { toast } = useToast();
  const [docName, setDocName] = useState('');
  const [docDescription, setDocDescription] = useState('');
  const [payslipPattern, setPayslipPattern] = useState('auto');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadMode, setUploadMode] = useState<'new' | 'existing'>('new');
  const [selectedDocId, setSelectedDocId] = useState<string>('');

  const documents = getDocuments(userId);

  useEffect(() => {
    if (!open) {
      setDocName('');
      setDocDescription('');
      setPayslipPattern('auto');
      setUploadMode('new');
      setSelectedDocId('');
    }
  }, [open]);

  const convertToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = error => reject(error);
    });
  };

  const handleUpload = async () => {
    if (uploadMode === 'new' && !docName.trim()) {
      toast({
        variant: 'destructive',
        title: 'Nome obrigatório',
        description: 'Digite um nome para o documento.',
      });
      return;
    }

    if (uploadMode === 'existing' && !selectedDocId) {
      toast({
        variant: 'destructive',
        title: 'Selecione um documento',
        description: 'Escolha um documento existente para agrupar.',
      });
      return;
    }

    // Check for duplicate name when creating new
    if (uploadMode === 'new') {
      const existingDoc = documents.find(d => d.name.toLowerCase() === docName.toLowerCase());
      if (existingDoc) {
        toast({
          variant: 'destructive',
          title: 'Nome duplicado',
          description: 'Já existe um documento com este nome.',
        });
        return;
      }
    }

    // Check storage - estimate if new files will fit
    const storage = getStorageUsage();
    const estimatedNewSize = files.reduce((acc, f) => acc + f.size * 1.37, 0); // base64 overhead ~37%
    const estimatedTotal = storage.used + estimatedNewSize;
    if (estimatedTotal > storage.max * 0.98) {
      toast({
        variant: 'destructive',
        title: 'Armazenamento insuficiente',
        description: `Espaço necessário: ~${(estimatedNewSize / 1024 / 1024).toFixed(1)}MB. Disponível: ~${((storage.max - storage.used) / 1024 / 1024).toFixed(1)}MB. Exclua alguns documentos.`,
      });
      return;
    }

    setIsUploading(true);

    try {
      const docFiles: DocumentFile[] = await Promise.all(
        files.map(async (file) => ({
          id: generateId(),
          name: file.name,
          type: file.type,
          size: file.size,
          base64: await convertToBase64(file),
          uploadedAt: new Date().toISOString(),
        }))
      );

      let targetDocId: string;

      if (uploadMode === 'existing') {
        // Add files to existing document
        const existingDoc = documents.find(d => d.id === selectedDocId);
        if (existingDoc) {
          const updatedDoc: Document = {
            ...existingDoc,
            files: [...existingDoc.files, ...docFiles],
            status: 'pending', // Reset status for re-extraction
            updatedAt: new Date().toISOString(),
          };
          saveDocument(updatedDoc);
          targetDocId = existingDoc.id;

          toast({
            title: 'Arquivos agrupados!',
            description: `${files.length} arquivo(s) adicionado(s) ao documento "${existingDoc.name}".`,
          });
        } else {
          throw new Error('Documento não encontrado');
        }
      } else {
        // Create new document
        const newDoc: Document = {
          id: generateId(),
          userId,
          name: docName,
          description: docDescription,
          payslipPattern: payslipPattern !== 'auto' ? payslipPattern : undefined,
          files: docFiles,
          extractedData: null,
          status: 'pending',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        saveDocument(newDoc);
        targetDocId = newDoc.id;

        toast({
          title: 'Upload concluído!',
          description: `${files.length} arquivo(s) enviado(s) com sucesso.`,
        });
      }

      onOpenChange(false);
      setFiles([]);
      onSuccess(targetDocId);
    } catch (error) {
      console.error('Upload error details:', error);
      const isQuota = error instanceof DOMException && error.name === 'QuotaExceededError';
      toast({
        variant: 'destructive',
        title: isQuota ? 'Armazenamento cheio' : 'Erro no upload',
        description: isQuota 
          ? 'O armazenamento local está cheio. Exclua documentos antigos para liberar espaço.'
          : (error instanceof Error ? error.message : 'Ocorreu um erro ao processar os arquivos.'),
      });
    }

    setIsUploading(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Upload de Documentos</DialogTitle>
          <DialogDescription>
            Envie novos arquivos ou agrupe com documentos existentes
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Selected files */}
          <div className="space-y-2">
            <Label>Arquivos selecionados</Label>
            <div className="space-y-2 max-h-32 overflow-y-auto">
              {files.map((file, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-2 rounded-lg bg-muted"
                >
                  <div className="flex items-center gap-2 truncate">
                    <FileText className="h-4 w-4 text-primary shrink-0" />
                    <span className="text-sm truncate">{file.name}</span>
                  </div>
                  <button
                    onClick={() => setFiles(files.filter((_, i) => i !== index))}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Upload mode selection */}
          {documents.length > 0 && (
            <div className="space-y-3">
              <Label>Como deseja salvar?</Label>
              <RadioGroup
                value={uploadMode}
                onValueChange={(value: 'new' | 'existing') => setUploadMode(value)}
                className="space-y-2"
              >
                <div className="flex items-center space-x-2 p-3 rounded-lg border hover:bg-muted/50 cursor-pointer">
                  <RadioGroupItem value="new" id="new" />
                  <Label htmlFor="new" className="flex items-center gap-2 cursor-pointer flex-1">
                    <FileText className="h-4 w-4" />
                    Criar novo documento
                  </Label>
                </div>
                <div className="flex items-center space-x-2 p-3 rounded-lg border hover:bg-muted/50 cursor-pointer">
                  <RadioGroupItem value="existing" id="existing" />
                  <Label htmlFor="existing" className="flex items-center gap-2 cursor-pointer flex-1">
                    <FolderPlus className="h-4 w-4" />
                    Agrupar com documento existente
                  </Label>
                </div>
              </RadioGroup>
            </div>
          )}

          {/* New document form */}
          {uploadMode === 'new' && (
            <>
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

              <div className="space-y-2">
                <Label>Modelo do Holerite</Label>
                <Select value={payslipPattern} onValueChange={setPayslipPattern}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o modelo..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Auto-detectar</SelectItem>
                    <SelectItem value="1a">1a - Holerite Normal (Folha Mensal)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Selecione o modelo para extração mais precisa ou deixe em auto-detectar.
                </p>
              </div>
            </>
          )}

          {/* Existing document selection */}
          {uploadMode === 'existing' && (
            <div className="space-y-2">
              <Label>Selecione o documento</Label>
              <Select value={selectedDocId} onValueChange={setSelectedDocId}>
                <SelectTrigger>
                  <SelectValue placeholder="Escolha um documento..." />
                </SelectTrigger>
                <SelectContent>
                  {documents.map(doc => (
                    <SelectItem key={doc.id} value={doc.id}>
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4" />
                        <span>{doc.name}</span>
                        <span className="text-xs text-muted-foreground">
                          ({doc.files.length} arquivo{doc.files.length !== 1 ? 's' : ''})
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Os arquivos serão adicionados ao documento selecionado e a extração será reprocessada.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isUploading}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleUpload}
            disabled={isUploading || files.length === 0}
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
                {uploadMode === 'existing' ? 'Agrupar' : 'Enviar'}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default UploadModal;
