import React, { useState, useEffect } from 'react';
import { Trash2, FileText, Loader2, Pencil, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { getTemplates, saveTemplate, deleteTemplate } from '@/lib/supabase-storage';
import { ExtractionTemplate } from '@/types';

const Templates: React.FC = () => {
  const { toast } = useToast();
  const [templates, setTemplates] = useState<ExtractionTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [templateToDelete, setTemplateToDelete] = useState<ExtractionTemplate | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const loadTemplates = async () => {
    setLoading(true);
    const data = await getTemplates();
    setTemplates(data);
    setLoading(false);
  };

  useEffect(() => { loadTemplates(); }, []);

  const handleDelete = async () => {
    if (!templateToDelete) return;
    await deleteTemplate(templateToDelete.id);
    toast({ title: 'Modelo excluído', description: `"${templateToDelete.name}" foi removido.` });
    setDeleteDialogOpen(false);
    setTemplateToDelete(null);
    loadTemplates();
  };

  const handleRename = async (template: ExtractionTemplate) => {
    if (!editName.trim()) return;
    await saveTemplate({ ...template, name: editName.trim() });
    toast({ title: 'Modelo renomeado' });
    setEditingId(null);
    loadTemplates();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Modelos de Extração</h1>
        <p className="text-muted-foreground text-sm">Gerencie os modelos salvos de validação de holerites</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Modelos Salvos</CardTitle>
          <CardDescription>
            {templates.length} modelo(s) cadastrado(s)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : templates.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>Nenhum modelo salvo ainda.</p>
              <p className="text-xs mt-1">Modelos são criados na aba "Validar" dos documentos extraídos.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead className="text-center">Mapeamentos</TableHead>
                  <TableHead className="text-center">Criado em</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {templates.map(t => (
                  <TableRow key={t.id}>
                    <TableCell>
                      {editingId === t.id ? (
                        <div className="flex items-center gap-1">
                          <Input
                            value={editName}
                            onChange={e => setEditName(e.target.value)}
                            className="h-7 text-sm w-48"
                            autoFocus
                            onKeyDown={e => {
                              if (e.key === 'Enter') handleRename(t);
                              if (e.key === 'Escape') setEditingId(null);
                            }}
                          />
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleRename(t)}>
                            <Check className="h-3.5 w-3.5 text-primary" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingId(null)}>
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ) : (
                        <span className="font-medium">{t.name}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="secondary">{t.field_mappings?.length || 0} campos</Badge>
                    </TableCell>
                    <TableCell className="text-center text-sm text-muted-foreground">
                      {new Date(t.created_at).toLocaleDateString('pt-BR')}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7"
                          onClick={() => { setEditingId(t.id); setEditName(t.name); }}
                        >
                          <Pencil className="h-3.5 w-3.5 mr-1" /> Renomear
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-destructive hover:text-destructive"
                          onClick={() => { setTemplateToDelete(t); setDeleteDialogOpen(true); }}
                        >
                          <Trash2 className="h-3.5 w-3.5 mr-1" /> Excluir
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar Exclusão</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja excluir o modelo "{templateToDelete?.name}"? Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDelete}>
              <Trash2 className="h-4 w-4 mr-2" /> Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Templates;
