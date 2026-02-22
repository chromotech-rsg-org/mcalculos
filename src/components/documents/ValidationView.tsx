import React, { useState, useMemo, useCallback } from 'react';
import { Check, EyeOff, Save, BookTemplate, Trash2, ArrowUpDown, Plus, X, GripVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { ExtractedData, FieldMapping, ExtractionTemplate } from '@/types';
import { getTemplates, saveTemplate, deleteTemplate, generateId } from '@/lib/storage';

interface ValidationViewProps {
  data: ExtractedData;
  onUpdate: (data: ExtractedData) => void;
}

interface FieldState {
  id: string;
  assignedKey: string;
  assignedValue: string;
  originalKey: string;
  originalValue: string;
  status: 'pending' | 'validated' | 'ignored';
  parentId?: string; // for grouping
  children?: string[]; // IDs of child fields
}

const ValidationView: React.FC<ValidationViewProps> = ({ data, onUpdate }) => {
  const { toast } = useToast();
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templates, setTemplates] = useState<ExtractionTemplate[]>(() => getTemplates());
  const [groupMode, setGroupMode] = useState(false);
  const [selectedForGroup, setSelectedForGroup] = useState<string[]>([]);
  const [groupParentId, setGroupParentId] = useState<string | null>(null);

  // Build field list from all months
  const initialFields = useMemo(() => {
    const seen = new Map<string, FieldState>();
    data.months.forEach(month => {
      month.fields?.forEach(f => {
        if (!seen.has(f.key)) {
          seen.set(f.key, {
            id: f.key,
            assignedKey: f.key,
            assignedValue: f.value,
            originalKey: f.key,
            originalValue: f.value,
            status: 'pending',
          });
        }
      });
    });
    return Array.from(seen.values());
  }, [data]);

  const [fields, setFields] = useState<FieldState[]>(initialFields);

  // Pool of all extracted strings (keys + values) for dropdowns
  const allStrings = useMemo(() => {
    const set = new Set<string>();
    data.months.forEach(month => {
      month.fields?.forEach(f => {
        if (f.key?.trim()) set.add(f.key.trim());
        if (f.value?.trim()) set.add(f.value.trim());
      });
    });
    return Array.from(set).sort();
  }, [data]);

  // Top-level fields (not children of a group)
  const topLevelFields = useMemo(() => fields.filter(f => !f.parentId), [fields]);

  const validatedCount = fields.filter(f => f.status === 'validated').length;
  const ignoredCount = fields.filter(f => f.status === 'ignored').length;
  const totalCount = fields.length;
  const progressPercent = totalCount > 0 ? Math.round(((validatedCount + ignoredCount) / totalCount) * 100) : 0;

  const updateField = useCallback((id: string, updates: Partial<FieldState>) => {
    setFields(prev => prev.map(f => f.id === id ? { ...f, ...updates } : f));
  }, []);

  const swapKeyValue = useCallback((id: string) => {
    setFields(prev => prev.map(f =>
      f.id === id ? { ...f, assignedKey: f.assignedValue, assignedValue: f.assignedKey } : f
    ));
    toast({ title: 'Título e valor trocados!' });
  }, [toast]);

  const toggleValidated = useCallback((id: string) => {
    setFields(prev => prev.map(f =>
      f.id === id ? { ...f, status: f.status === 'validated' ? 'pending' : 'validated' } : f
    ));
  }, []);

  const toggleIgnored = useCallback((id: string) => {
    setFields(prev => prev.map(f =>
      f.id === id ? { ...f, status: f.status === 'ignored' ? 'pending' : 'ignored' } : f
    ));
  }, []);

  // Grouping: create parent from selected fields
  const createGroup = () => {
    if (selectedForGroup.length < 2) {
      toast({ title: 'Selecione ao menos 2 campos para agrupar.' });
      return;
    }

    const parentId = selectedForGroup[0];
    const childIds = selectedForGroup.slice(1);

    setFields(prev => prev.map(f => {
      if (f.id === parentId) {
        return { ...f, children: [...(f.children || []), ...childIds] };
      }
      if (childIds.includes(f.id)) {
        return { ...f, parentId };
      }
      return f;
    }));

    toast({ title: 'Grupo criado!', description: `${childIds.length} campo(s) agrupados sob "${fields.find(f => f.id === parentId)?.assignedKey}".` });
    setSelectedForGroup([]);
    setGroupMode(false);
  };

  // Ungroup: remove a child from its parent
  const ungroupField = (childId: string) => {
    setFields(prev => {
      const child = prev.find(f => f.id === childId);
      if (!child?.parentId) return prev;
      return prev.map(f => {
        if (f.id === child.parentId) {
          return { ...f, children: (f.children || []).filter(c => c !== childId) };
        }
        if (f.id === childId) {
          return { ...f, parentId: undefined };
        }
        return f;
      });
    });
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
          if (state) {
            return { key: state.assignedKey, value: state.assignedValue };
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
      mappedKey: f.assignedKey,
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
          assignedKey: mapping.mappedKey,
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

  const renderFieldCard = (field: FieldState, isChild = false) => {
    const children = fields.filter(f => f.parentId === field.id);

    return (
      <Card
        key={field.id}
        className={`transition-all ${
          field.status === 'validated' ? 'border-primary/50 bg-primary/5' :
          field.status === 'ignored' ? 'border-muted bg-muted/30 opacity-60' :
          'border-border'
        } ${isChild ? 'ml-4 border-l-2 border-l-primary/30' : ''}`}
      >
        <CardContent className="p-3 space-y-2">
          {/* Group checkbox */}
          {groupMode && !field.parentId && (
            <div className="flex items-center gap-2">
              <Checkbox
                checked={selectedForGroup.includes(field.id)}
                onCheckedChange={(checked) => {
                  setSelectedForGroup(prev =>
                    checked ? [...prev, field.id] : prev.filter(id => id !== field.id)
                  );
                }}
              />
              <span className="text-xs text-muted-foreground">
                {selectedForGroup.indexOf(field.id) === 0 ? '(campo pai)' :
                 selectedForGroup.includes(field.id) ? '(será agrupado)' : 'Selecionar'}
              </span>
            </div>
          )}

          {/* Title (Key) selector */}
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Título</Label>
            <Select
              value={field.assignedKey}
              onValueChange={(val) => {
                if (val === '__custom__') {
                  const custom = prompt('Digite o título personalizado:', field.assignedKey);
                  if (custom?.trim()) updateField(field.id, { assignedKey: custom.trim() });
                } else {
                  updateField(field.id, { assignedKey: val });
                }
              }}
            >
              <SelectTrigger className="h-8 text-xs font-medium">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-60">
                {allStrings.map((s, i) => (
                  <SelectItem key={`key-${i}-${s}`} value={s}>
                    <span className={s === field.assignedKey ? 'font-bold' : ''}>
                      {s.length > 50 ? s.substring(0, 50) + '…' : s}
                    </span>
                  </SelectItem>
                ))}
                <SelectItem value="__custom__">
                  <span className="italic text-muted-foreground">✏️ Digitar personalizado...</span>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Swap button */}
          <div className="flex justify-center">
            <Button
              size="sm"
              variant="ghost"
              className="h-6 text-xs gap-1 text-muted-foreground hover:text-foreground"
              onClick={() => swapKeyValue(field.id)}
              title="Trocar título ↔ valor"
            >
              <ArrowUpDown className="h-3 w-3" />
              trocar ↔
            </Button>
          </div>

          {/* Value selector */}
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Valor</Label>
            <Select
              value={field.assignedValue}
              onValueChange={(val) => {
                if (val === '__custom__') {
                  const custom = prompt('Digite o valor personalizado:', field.assignedValue);
                  if (custom?.trim()) updateField(field.id, { assignedValue: custom.trim() });
                } else {
                  updateField(field.id, { assignedValue: val });
                }
              }}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-60">
                {allStrings.map((s, i) => (
                  <SelectItem key={`val-${i}-${s}`} value={s}>
                    <span className={s === field.assignedValue ? 'font-bold' : ''}>
                      {s.length > 50 ? s.substring(0, 50) + '…' : s}
                    </span>
                  </SelectItem>
                ))}
                <SelectItem value="__custom__">
                  <span className="italic text-muted-foreground">✏️ Digitar personalizado...</span>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Changes indicator */}
          <div className="flex flex-wrap gap-1">
            {field.assignedKey !== field.originalKey && (
              <Badge variant="secondary" className="text-[10px] px-1 py-0">
                título: era "{field.originalKey.substring(0, 20)}"
              </Badge>
            )}
            {field.assignedValue !== field.originalValue && (
              <Badge variant="secondary" className="text-[10px] px-1 py-0">
                valor alterado
              </Badge>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-between pt-1 border-t border-border/50">
            <div className="flex gap-1">
              <Button
                size="sm"
                variant={field.status === 'validated' ? 'default' : 'ghost'}
                className={`h-7 text-xs gap-1 ${field.status === 'validated' ? 'bg-primary text-primary-foreground' : ''}`}
                onClick={() => toggleValidated(field.id)}
              >
                <Check className="h-3 w-3" />
                OK
              </Button>
              <Button
                size="sm"
                variant={field.status === 'ignored' ? 'destructive' : 'ghost'}
                className="h-7 text-xs gap-1"
                onClick={() => toggleIgnored(field.id)}
              >
                <EyeOff className="h-3 w-3" />
                Ignorar
              </Button>
            </div>
            {isChild && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs gap-1"
                onClick={() => ungroupField(field.id)}
              >
                <X className="h-3 w-3" />
                Desagrupar
              </Button>
            )}
          </div>

          {/* Render children if this is a parent */}
          {children.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-primary/20">
              <span className="text-[10px] uppercase tracking-wider text-primary font-medium">
                Campos agrupados ({children.length})
              </span>
              {children.map(child => renderFieldCard(child, true))}
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-4">
      {/* Progress bar */}
      <div className="flex-1 w-full">
        <div className="flex items-center justify-between text-sm mb-1">
          <span className="text-muted-foreground">
            {validatedCount} validados, {ignoredCount} ignorados de {totalCount} campos
          </span>
          <span className="font-medium">{progressPercent}%</span>
        </div>
        <Progress value={progressPercent} className="h-2" />
      </div>

      {/* Toolbar */}
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
          {groupMode ? (
            <>
              <Button variant="outline" size="sm" onClick={() => { setGroupMode(false); setSelectedForGroup([]); }}>
                <X className="h-4 w-4 mr-1" />
                Cancelar
              </Button>
              <Button size="sm" onClick={createGroup} disabled={selectedForGroup.length < 2}>
                <Plus className="h-4 w-4 mr-1" />
                Criar Grupo ({selectedForGroup.length})
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" size="sm" onClick={() => setGroupMode(true)}>
                <GripVertical className="h-4 w-4 mr-1" />
                Agrupar Campos
              </Button>
              <Button variant="outline" size="sm" onClick={() => setSaveDialogOpen(true)}>
                <BookTemplate className="h-4 w-4 mr-1" />
                Salvar como Modelo
              </Button>
              <Button size="sm" onClick={handleApplyChanges}>
                <Check className="h-4 w-4 mr-1" />
                Aplicar Alterações
              </Button>
            </>
          )}
        </div>
      </div>

      {groupMode && (
        <div className="bg-accent/50 border border-accent rounded-md p-3 text-sm text-accent-foreground">
          Selecione os campos para agrupar. O primeiro selecionado será o <strong>campo pai</strong>.
        </div>
      )}

      {/* Field cards */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {topLevelFields.map(field => renderFieldCard(field))}
      </div>

      {/* Save Template Dialog */}
      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Salvar como Modelo</DialogTitle>
            <DialogDescription>
              Dê um nome para este modelo. Ele será usado para aplicar as mesmas regras em documentos futuros.
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
