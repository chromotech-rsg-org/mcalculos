import React, { useState, useMemo } from 'react';
import { Check, EyeOff, Edit2, Save, BookTemplate, Trash2, ArrowLeftRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { ExtractedData, FieldMapping, ExtractionTemplate } from '@/types';
import { getTemplates, saveTemplate, deleteTemplate, generateId } from '@/lib/storage';

interface ValidationViewProps {
  data: ExtractedData;
  onUpdate: (data: ExtractedData) => void;
}

interface FieldState {
  originalKey: string;
  mappedKey: string;
  sampleValues: string[];
  status: 'pending' | 'validated' | 'ignored';
}

const ValidationView: React.FC<ValidationViewProps> = ({ data, onUpdate }) => {
  const { toast } = useToast();
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templates, setTemplates] = useState<ExtractionTemplate[]>(() => getTemplates());
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [swappingKey, setSwappingKey] = useState<string | null>(null);

  // Build unique field list with sample values from all months
  const initialFields = useMemo(() => {
    const map = new Map<string, string[]>();
    data.months.forEach(month => {
      month.fields?.forEach(f => {
        if (!map.has(f.key)) map.set(f.key, []);
        const arr = map.get(f.key)!;
        if (f.value && !arr.includes(f.value) && arr.length < 3) arr.push(f.value);
      });
    });
    return Array.from(map.entries()).map(([key, vals]): FieldState => ({
      originalKey: key,
      mappedKey: key,
      sampleValues: vals,
      status: 'pending',
    }));
  }, [data]);

  const [fields, setFields] = useState<FieldState[]>(initialFields);

  // All available key names for the swap selector
  const allKeyOptions = useMemo(() => {
    const keys = new Set<string>();
    fields.forEach(f => {
      keys.add(f.originalKey);
      if (f.mappedKey !== f.originalKey) keys.add(f.mappedKey);
    });
    return Array.from(keys).sort();
  }, [fields]);

  const validatedCount = fields.filter(f => f.status === 'validated').length;
  const ignoredCount = fields.filter(f => f.status === 'ignored').length;
  const totalCount = fields.length;
  const progressPercent = totalCount > 0 ? Math.round(((validatedCount + ignoredCount) / totalCount) * 100) : 0;

  const toggleValidated = (originalKey: string) => {
    setFields(prev => prev.map(f =>
      f.originalKey === originalKey
        ? { ...f, status: f.status === 'validated' ? 'pending' : 'validated' }
        : f
    ));
  };

  const toggleIgnored = (originalKey: string) => {
    setFields(prev => prev.map(f =>
      f.originalKey === originalKey
        ? { ...f, status: f.status === 'ignored' ? 'pending' : 'ignored' }
        : f
    ));
  };

  const startRename = (originalKey: string, currentMapped: string) => {
    setEditingKey(originalKey);
    setEditValue(currentMapped);
    setSwappingKey(null);
  };

  const saveRename = () => {
    if (!editingKey || !editValue.trim()) return;
    setFields(prev => prev.map(f =>
      f.originalKey === editingKey
        ? { ...f, mappedKey: editValue.trim() }
        : f
    ));
    setEditingKey(null);
    setEditValue('');
  };

  // Swap: reassign this field's title to another field's title (and vice versa)
  const handleSwapKey = (originalKey: string, newMappedKey: string) => {
    setFields(prev => {
      // Find if another field currently has the newMappedKey as its mappedKey
      const otherField = prev.find(f => f.originalKey !== originalKey && f.mappedKey === newMappedKey);
      const currentField = prev.find(f => f.originalKey === originalKey);
      
      return prev.map(f => {
        if (f.originalKey === originalKey) {
          return { ...f, mappedKey: newMappedKey };
        }
        // If another field had that mappedKey, swap it to the current field's mappedKey
        if (otherField && f.originalKey === otherField.originalKey && currentField) {
          return { ...f, mappedKey: currentField.mappedKey };
        }
        return f;
      });
    });
    setSwappingKey(null);
    toast({ title: 'Título trocado!', description: `Campo agora mapeado para "${newMappedKey}"` });
  };

  const applyToData = (): ExtractedData => {
    const updatedMonths = data.months.map(month => {
      const updatedFields = month.fields
        ?.filter(f => {
          const state = fields.find(s => s.originalKey === f.key);
          return !state || state.status !== 'ignored';
        })
        .map(f => {
          const state = fields.find(s => s.originalKey === f.key);
          if (state && state.mappedKey !== state.originalKey) {
            return { ...f, key: state.mappedKey };
          }
          return f;
        }) || [];
      return { ...month, fields: updatedFields, validationStatus: 'validated' as const };
    });
    return { ...data, months: updatedMonths };
  };

  const handleApplyChanges = () => {
    const updated = applyToData();
    onUpdate(updated);
    toast({ title: 'Validação aplicada!', description: 'Os campos foram atualizados.' });
  };

  const handleSaveTemplate = () => {
    if (!templateName.trim()) return;
    const mappings: FieldMapping[] = fields.map(f => ({
      originalKey: f.originalKey,
      mappedKey: f.mappedKey,
      ignore: f.status === 'ignored',
      validated: f.status === 'validated',
    }));

    const template: ExtractionTemplate = {
      id: generateId(),
      name: templateName.trim(),
      fieldMappings: mappings,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    saveTemplate(template);
    setTemplates(getTemplates());
    setSaveDialogOpen(false);
    setTemplateName('');
    handleApplyChanges();
    toast({ title: 'Modelo salvo!', description: `"${template.name}" disponível para reutilização.` });
  };

  const handleApplyTemplate = (templateId: string) => {
    const tmpl = templates.find(t => t.id === templateId);
    if (!tmpl) return;

    setFields(prev => prev.map(f => {
      const mapping = tmpl.fieldMappings.find(m => m.originalKey === f.originalKey);
      if (mapping) {
        return {
          ...f,
          mappedKey: mapping.mappedKey,
          status: mapping.ignore ? 'ignored' : mapping.validated ? 'validated' : 'pending',
        };
      }
      return f;
    }));
    toast({ title: 'Modelo aplicado!', description: `Regras de "${tmpl.name}" carregadas.` });
  };

  const handleDeleteTemplate = (templateId: string) => {
    deleteTemplate(templateId);
    setTemplates(getTemplates());
    toast({ title: 'Modelo excluído' });
  };

  return (
    <div className="space-y-4">
      {/* Progress bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex-1 w-full">
          <div className="flex items-center justify-between text-sm mb-1">
            <span className="text-muted-foreground">
              {validatedCount} validados, {ignoredCount} ignorados de {totalCount} campos
            </span>
            <span className="font-medium">{progressPercent}%</span>
          </div>
          <Progress value={progressPercent} className="h-2" />
        </div>
      </div>

      {/* Template selector + save */}
      <div className="flex flex-wrap gap-2 items-center">
        {templates.length > 0 && (
          <div className="flex items-center gap-2">
            <Select onValueChange={handleApplyTemplate}>
              <SelectTrigger className="w-56 h-9">
                <SelectValue placeholder="Aplicar modelo salvo..." />
              </SelectTrigger>
              <SelectContent>
                {templates.map(t => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name} ({t.fieldMappings.length} regras)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select onValueChange={handleDeleteTemplate}>
              <SelectTrigger className="w-10 h-9 px-2">
                <Trash2 className="h-3.5 w-3.5" />
              </SelectTrigger>
              <SelectContent>
                {templates.map(t => (
                  <SelectItem key={t.id} value={t.id}>
                    Excluir: {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="flex gap-2 ml-auto">
          <Button variant="outline" size="sm" onClick={() => setSaveDialogOpen(true)}>
            <BookTemplate className="h-4 w-4 mr-1" />
            Salvar como Modelo
          </Button>
          <Button size="sm" onClick={handleApplyChanges}>
            <Check className="h-4 w-4 mr-1" />
            Aplicar Alterações
          </Button>
        </div>
      </div>

      {/* Field cards */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {fields.map(field => (
          <Card
            key={field.originalKey}
            className={`transition-all ${
              field.status === 'validated' ? 'border-primary/50 bg-primary/5' :
              field.status === 'ignored' ? 'border-muted bg-muted/30 opacity-60' :
              'border-border'
            }`}
          >
            <CardContent className="p-3 space-y-2">
              {/* Title row */}
              <div className="flex items-start justify-between gap-1">
                {editingKey === field.originalKey ? (
                  <div className="flex items-center gap-1 flex-1">
                    <Input
                      value={editValue}
                      onChange={e => setEditValue(e.target.value)}
                      className="h-7 text-xs"
                      autoFocus
                      onKeyDown={e => {
                        if (e.key === 'Enter') saveRename();
                        if (e.key === 'Escape') setEditingKey(null);
                      }}
                    />
                    <Button size="icon" variant="ghost" className="h-6 w-6 flex-shrink-0" onClick={saveRename}>
                      <Save className="h-3 w-3" />
                    </Button>
                  </div>
                ) : swappingKey === field.originalKey ? (
                  <div className="flex-1">
                    <Select
                      value={field.mappedKey}
                      onValueChange={(val) => {
                        if (val === '__custom__') {
                          startRename(field.originalKey, field.mappedKey);
                        } else {
                          handleSwapKey(field.originalKey, val);
                        }
                      }}
                    >
                      <SelectTrigger className="h-7 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {allKeyOptions.map(key => (
                          <SelectItem key={key} value={key}>
                            <span className={key === field.mappedKey ? 'font-bold' : ''}>
                              {key}
                            </span>
                          </SelectItem>
                        ))}
                        <SelectItem value="__custom__">
                          <span className="italic text-muted-foreground">✏️ Digitar nome personalizado...</span>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 min-w-0">
                    <span className="font-medium text-sm truncate">{field.mappedKey}</span>
                    {field.mappedKey !== field.originalKey && (
                      <Badge variant="secondary" className="text-[10px] px-1 py-0 flex-shrink-0">
                        era: {field.originalKey}
                      </Badge>
                    )}
                  </div>
                )}

                <div className="flex gap-0.5 flex-shrink-0">
                  <Button
                    size="icon"
                    variant={swappingKey === field.originalKey ? 'secondary' : 'ghost'}
                    className="h-6 w-6"
                    onClick={() => setSwappingKey(swappingKey === field.originalKey ? null : field.originalKey)}
                    title="Escolher título correto"
                  >
                    <ArrowLeftRight className="h-3 w-3" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6"
                    onClick={() => startRename(field.originalKey, field.mappedKey)}
                    title="Renomear campo"
                  >
                    <Edit2 className="h-3 w-3" />
                  </Button>
                  <Button
                    size="icon"
                    variant={field.status === 'validated' ? 'default' : 'ghost'}
                    className={`h-6 w-6 ${field.status === 'validated' ? 'bg-primary text-primary-foreground' : ''}`}
                    onClick={() => toggleValidated(field.originalKey)}
                    title="Validar campo"
                  >
                    <Check className="h-3 w-3" />
                  </Button>
                  <Button
                    size="icon"
                    variant={field.status === 'ignored' ? 'destructive' : 'ghost'}
                    className="h-6 w-6"
                    onClick={() => toggleIgnored(field.originalKey)}
                    title="Ignorar campo"
                  >
                    <EyeOff className="h-3 w-3" />
                  </Button>
                </div>
              </div>

              {/* Sample values */}
              <div className="space-y-0.5">
                {field.sampleValues.map((val, i) => (
                  <p key={i} className={`text-xs ${field.status === 'ignored' ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                    {val}
                  </p>
                ))}
                {field.sampleValues.length === 0 && (
                  <p className="text-xs text-muted-foreground italic">Sem valor</p>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Save Template Dialog */}
      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Salvar como Modelo</DialogTitle>
            <DialogDescription>
              Dê um nome para este modelo. Ele será usado para aplicar as mesmas regras em documentos futuros com layout similar.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Nome do Modelo</Label>
            <Input
              value={templateName}
              onChange={e => setTemplateName(e.target.value)}
              placeholder="Ex: Modelo Keypar, Centro de Ensino..."
              autoFocus
              onKeyDown={e => { if (e.key === 'Enter') handleSaveTemplate(); }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSaveTemplate} disabled={!templateName.trim()}>
              <Save className="h-4 w-4 mr-1" />
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ValidationView;
