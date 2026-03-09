import React, { useState, useEffect } from 'react';
import { Upload, FileText, X, Loader2, FolderPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useToast } from '@/hooks/use-toast';
import { getDocuments, saveDocument, generateId, getTemplates } from '@/lib/supabase-storage';
import { Document, DocumentFile, ExtractionTemplate } from '@/types';

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
  const [documents, setDocuments] = useState<Document[]>([]);
  const [templates, setTemplates] = useState<ExtractionTemplate[]>([]);
  const [selectedTabs, setSelectedTabs] = useState<TabType[]>(['vencimentos', 'descontos', 'quantidade']);

  useEffect(() => {
    if (open) {
      getDocuments(userId).then(setDocuments);
      getTemplates().then(setTemplates);
    }
  }, [open, userId]);

  useEffect(() => {
    if (!open) {
      setDocName('');
      setDocDescription('');
      setPayslipPattern('auto');
      setUploadMode('new');
      setSelectedDocId('');
      setSelectedTabs(['vencimentos', 'descontos', 'quantidade']);
    } else if (files.length > 0 && !docName) {
      const firstName = files[0].name.replace(/\.[^/.]+$/, '');
      setDocName(firstName);
    }
  }, [open, files]);

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
      toast({ variant: 'destructive', title: 'Nome obrigatório', description: 'Digite um nome para o documento.' });
      return;
    }

    if (uploadMode === 'existing' && !selectedDocId) {
      toast({ variant: 'destructive', title: 'Selecione um documento', description: 'Escolha um documento existente para agrupar.' });
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
        const existingDoc = documents.find(d => d.id === selectedDocId);
        if (existingDoc) {
          const updatedDoc: Document = {
            ...existingDoc,
            files: [...existingDoc.files, ...docFiles],
            status: 'pending',
            updated_at: new Date().toISOString(),
          };
          await saveDocument(updatedDoc);
          targetDocId = existingDoc.id;
          toast({ title: 'Arquivos agrupados!', description: `${files.length} arquivo(s) adicionado(s).` });
        } else {
          throw new Error('Documento não encontrado');
        }
      } else {
        const templatePrefix = 'template:';
        const isTemplatePattern = payslipPattern.startsWith(templatePrefix);
        const newDoc: Document = {
          id: generateId(),
          user_id: userId,
          name: docName,
          description: docDescription,
          payslip_pattern: isTemplatePattern ? '1a' : (payslipPattern !== 'auto' ? payslipPattern : undefined),
          template_id: isTemplatePattern ? payslipPattern.replace(templatePrefix, '') : undefined,
          files: docFiles,
          extracted_data: null,
          status: 'pending',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          extractionOptions: { selectedTabs },
        };

        await saveDocument(newDoc);
        targetDocId = newDoc.id;
        toast({ title: 'Upload concluído!', description: `${files.length} arquivo(s) enviado(s) com sucesso.` });
      }

      onOpenChange(false);
      setFiles([]);
      onSuccess(targetDocId);
    } catch (error) {
      console.error('Upload error:', error);
      toast({ variant: 'destructive', title: 'Erro no upload', description: 'Ocorreu um erro ao processar os arquivos.' });
    }

    setIsUploading(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Upload de Documentos</DialogTitle>
          <DialogDescription>Envie novos arquivos ou agrupe com documentos existentes</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Arquivos selecionados</Label>
            <div className="space-y-2 max-h-32 overflow-y-auto">
              {files.map((file, index) => (
                <div key={index} className="flex items-center justify-between p-2 rounded-lg bg-muted">
                  <div className="flex items-center gap-2 truncate">
                    <FileText className="h-4 w-4 text-primary shrink-0" />
                    <span className="text-sm truncate">{file.name}</span>
                  </div>
                  <button onClick={() => setFiles(files.filter((_, i) => i !== index))} className="text-muted-foreground hover:text-destructive">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {documents.length > 0 && (
            <div className="space-y-3">
              <Label>Como deseja salvar?</Label>
              <RadioGroup value={uploadMode} onValueChange={(value: 'new' | 'existing') => setUploadMode(value)} className="space-y-2">
                <div className="flex items-center space-x-2 p-3 rounded-lg border hover:bg-muted/50 cursor-pointer">
                  <RadioGroupItem value="new" id="new" />
                  <Label htmlFor="new" className="flex items-center gap-2 cursor-pointer flex-1">
                    <FileText className="h-4 w-4" />Criar novo documento
                  </Label>
                </div>
                <div className="flex items-center space-x-2 p-3 rounded-lg border hover:bg-muted/50 cursor-pointer">
                  <RadioGroupItem value="existing" id="existing" />
                  <Label htmlFor="existing" className="flex items-center gap-2 cursor-pointer flex-1">
                    <FolderPlus className="h-4 w-4" />Agrupar com documento existente
                  </Label>
                </div>
              </RadioGroup>
            </div>
          )}

          {uploadMode === 'new' && (
            <>
              <div className="space-y-2">
                <Label htmlFor="docName">Nome do Documento *</Label>
                <Input id="docName" placeholder="Ex: Holerite Janeiro 2024" value={docName} onChange={(e) => setDocName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="docDescription">Descrição</Label>
                <Textarea id="docDescription" placeholder="Descrição opcional..." value={docDescription} onChange={(e) => setDocDescription(e.target.value)} rows={3} />
              </div>
              <div className="space-y-2">
                <Label>Modelo do Holerite</Label>
                <Select value={payslipPattern} onValueChange={setPayslipPattern}>
                  <SelectTrigger><SelectValue placeholder="Selecione o modelo..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Auto-detectar</SelectItem>
                    <SelectItem value="1a">1a - Holerite Normal (Folha Mensal)</SelectItem>
                    {templates.length > 0 && (
                      <>
                        <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground border-t mt-1 pt-1">Modelos Salvos</div>
                        {templates.map(t => (
                          <SelectItem key={t.id} value={`template:${t.id}`}>📋 {t.name}</SelectItem>
                        ))}
                      </>
                    )}
                  </SelectContent>
                </Select>
              </div>
              
              {(payslipPattern === '1a' || payslipPattern === 'auto') && (
                <div className="space-y-3">
                  <Label>Abas para extrair</Label>
                  <div className="space-y-2">
                    {(['vencimentos', 'descontos', 'quantidade'] as TabType[]).map(tab => (
                      <div key={tab} className="flex items-center space-x-2">
                        <Checkbox
                          id={tab}
                          checked={selectedTabs.includes(tab)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedTabs(prev => [...prev, tab]);
                            } else {
                              setSelectedTabs(prev => prev.filter(t => t !== tab));
                            }
                          }}
                        />
                        <Label htmlFor={tab} className="text-sm">
                          {tab === 'vencimentos' && 'Vencimentos'}
                          {tab === 'descontos' && 'Descontos'}
                          {tab === 'quantidade' && 'QTDE'}
                        </Label>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Selecione quais abas serão geradas na visualização dos dados.
                  </p>
                </div>
              )}
            </>
          )}

          {uploadMode === 'existing' && (
            <div className="space-y-2">
              <Label>Selecione o documento</Label>
              <Select value={selectedDocId} onValueChange={setSelectedDocId}>
                <SelectTrigger><SelectValue placeholder="Escolha um documento..." /></SelectTrigger>
                <SelectContent>
                  {documents.map(doc => (
                    <SelectItem key={doc.id} value={doc.id}>
                      {doc.name} ({doc.files.length} arquivo{doc.files.length !== 1 ? 's' : ''})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isUploading}>Cancelar</Button>
          <Button onClick={handleUpload} disabled={isUploading || files.length === 0} className="gradient-primary text-primary-foreground">
            {isUploading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Enviando...</> : <><Upload className="h-4 w-4 mr-2" />{uploadMode === 'existing' ? 'Agrupar' : 'Enviar'}</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default UploadModal;
