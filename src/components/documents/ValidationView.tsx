import React, { useState, useMemo, useCallback } from 'react';
import { Check, EyeOff, Save, BookTemplate, Trash2, ArrowUpDown, Plus, X, GripVertical, CheckSquare, Square, MinusSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { ExtractedData, FieldMapping, ExtractionTemplate, PayslipEvent } from '@/types';
import { getTemplates, saveTemplate, deleteTemplate, generateId } from '@/lib/storage';
import SearchableFieldSelect from './SearchableFieldSelect';

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
  parentId?: string;
  children?: string[];
}

interface EventState {
  id: string;
  originalIndex: number;
  codigo: string;
  descricao: string;
  referencia: string;
  vencimento: string;
  desconto: string;
  status: 'pending' | 'validated' | 'ignored';
}

const ValidationView: React.FC<ValidationViewProps> = ({ data, onUpdate }) => {
  const { toast } = useToast();
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templates, setTemplates] = useState<ExtractionTemplate[]>(() => getTemplates());
  const [groupMode, setGroupMode] = useState(false);
  const [selectedForGroup, setSelectedForGroup] = useState<string[]>([]);
  const [selectedFields, setSelectedFields] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<'fields' | 'events'>('fields');

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

  // Build events list from all months
  const initialEvents = useMemo(() => {
    const events: EventState[] = [];
    const seen = new Set<string>();
    data.months.forEach(month => {
      month.eventos?.forEach((ev, idx) => {
        const evId = `${ev.codigo}-${ev.descricao}`;
        if (!seen.has(evId)) {
          seen.add(evId);
          events.push({
            id: evId,
            originalIndex: idx,
            codigo: ev.codigo,
            descricao: ev.descricao,
            referencia: ev.referencia,
            vencimento: ev.vencimento,
            desconto: ev.desconto,
            status: 'pending',
          });
        }
      });
    });
    return events;
  }, [data]);

  const [fields, setFields] = useState<FieldState[]>(initialFields);
  const [events, setEvents] = useState<EventState[]>(initialEvents);
  const [selectedEvents, setSelectedEvents] = useState<Set<string>>(new Set());

  // Pool of all extracted strings (keys + values) for dropdowns
  const allStrings = useMemo(() => {
    const set = new Set<string>();
    data.months.forEach(month => {
      month.fields?.forEach(f => {
        if (f.key?.trim()) set.add(f.key.trim());
        if (f.value?.trim()) set.add(f.value.trim());
      });
      // Also include event descriptions and values
      month.eventos?.forEach(ev => {
        if (ev.descricao?.trim()) set.add(ev.descricao.trim());
        if (ev.vencimento?.trim()) set.add(ev.vencimento.trim());
        if (ev.desconto?.trim()) set.add(ev.desconto.trim());
      });
    });
    return Array.from(set).sort();
  }, [data]);

  // Top-level fields (not children of a group)
  const topLevelFields = useMemo(() => fields.filter(f => !f.parentId), [fields]);

  const validatedCount = fields.filter(f => f.status === 'validated').length + events.filter(e => e.status === 'validated').length;
  const ignoredCount = fields.filter(f => f.status === 'ignored').length + events.filter(e => e.status === 'ignored').length;
  const totalCount = fields.length + events.length;
  const progressPercent = totalCount > 0 ? Math.round(((validatedCount + ignoredCount) / totalCount) * 100) : 0;

  // Field actions
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

  // Bulk selection
  const toggleFieldSelection = (id: string) => {
    setSelectedFields(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAllFields = () => {
    setSelectedFields(new Set(topLevelFields.map(f => f.id)));
  };

  const deselectAllFields = () => {
    setSelectedFields(new Set());
  };

  const bulkAction = (action: 'validated' | 'ignored' | 'pending') => {
    setFields(prev => prev.map(f => selectedFields.has(f.id) ? { ...f, status: action } : f));
    toast({ title: action === 'validated' ? 'Campos validados!' : action === 'ignored' ? 'Campos ignorados!' : 'Campos resetados!' });
    setSelectedFields(new Set());
  };

  // Event actions
  const toggleEventValidated = (id: string) => {
    setEvents(prev => prev.map(e =>
      e.id === id ? { ...e, status: e.status === 'validated' ? 'pending' : 'validated' } : e
    ));
  };

  const toggleEventIgnored = (id: string) => {
    setEvents(prev => prev.map(e =>
      e.id === id ? { ...e, status: e.status === 'ignored' ? 'pending' : 'ignored' } : e
    ));
  };

  const toggleEventSelection = (id: string) => {
    setSelectedEvents(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAllEvents = () => setSelectedEvents(new Set(events.map(e => e.id)));
  const deselectAllEvents = () => setSelectedEvents(new Set());

  const bulkEventAction = (action: 'validated' | 'ignored' | 'pending') => {
    setEvents(prev => prev.map(e => selectedEvents.has(e.id) ? { ...e, status: action } : e));
    toast({ title: action === 'validated' ? 'Eventos validados!' : action === 'ignored' ? 'Eventos ignorados!' : 'Eventos resetados!' });
    setSelectedEvents(new Set());
  };

  const updateEvent = (id: string, updates: Partial<EventState>) => {
    setEvents(prev => prev.map(e => e.id === id ? { ...e, ...updates } : e));
  };

  // Grouping
  const createGroup = () => {
    if (selectedForGroup.length < 2) {
      toast({ title: 'Selecione ao menos 2 campos para agrupar.' });
      return;
    }
    const parentId = selectedForGroup[0];
    const childIds = selectedForGroup.slice(1);
    setFields(prev => prev.map(f => {
      if (f.id === parentId) return { ...f, children: [...(f.children || []), ...childIds] };
      if (childIds.includes(f.id)) return { ...f, parentId };
      return f;
    }));
    toast({ title: 'Grupo criado!' });
    setSelectedForGroup([]);
    setGroupMode(false);
  };

  const ungroupField = (childId: string) => {
    setFields(prev => {
      const child = prev.find(f => f.id === childId);
      if (!child?.parentId) return prev;
      return prev.map(f => {
        if (f.id === child.parentId) return { ...f, children: (f.children || []).filter(c => c !== childId) };
        if (f.id === childId) return { ...f, parentId: undefined };
        return f;
      });
    });
  };

  // Apply & save
  const applyToData = (): ExtractedData => {
    const updatedMonths = data.months.map(month => {
      const updatedFields = month.fields
        ?.filter(f => {
          const state = fields.find(s => s.originalKey === f.key);
          return !state || state.status !== 'ignored';
        })
        .map(f => {
          const state = fields.find(s => s.originalKey === f.key);
          if (state) return { key: state.assignedKey, value: state.assignedValue };
          return f;
        }) || [];

      const updatedEvents = month.eventos
        ?.filter(ev => {
          const evId = `${ev.codigo}-${ev.descricao}`;
          const state = events.find(e => e.id === evId);
          return !state || state.status !== 'ignored';
        })
        .map(ev => {
          const evId = `${ev.codigo}-${ev.descricao}`;
          const state = events.find(e => e.id === evId);
          if (state) {
            return {
              codigo: state.codigo,
              descricao: state.descricao,
              referencia: state.referencia,
              vencimento: state.vencimento,
              desconto: state.desconto,
            };
          }
          return ev;
        }) || [];

      return { ...month, fields: updatedFields, eventos: updatedEvents, validationStatus: 'validated' as const };
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
    toast({ title: 'Modelo salvo!' });
  };

  const handleApplyTemplate = (templateId: string) => {
    const tmpl = templates.find(t => t.id === templateId);
    if (!tmpl) return;
    setFields(prev => prev.map(f => {
      const mapping = tmpl.fieldMappings.find(m => m.originalKey === f.originalKey);
      if (mapping) {
        return { ...f, assignedKey: mapping.mappedKey, status: mapping.ignore ? 'ignored' : mapping.validated ? 'validated' : 'pending' };
      }
      return f;
    }));
    toast({ title: 'Modelo aplicado!' });
  };

  const handleDeleteTemplate = (templateId: string) => {
    deleteTemplate(templateId);
    setTemplates(getTemplates());
    toast({ title: 'Modelo excluído' });
  };

  const allFieldsSelected = topLevelFields.length > 0 && selectedFields.size === topLevelFields.length;
  const someFieldsSelected = selectedFields.size > 0 && !allFieldsSelected;
  const allEventsSelected = events.length > 0 && selectedEvents.size === events.length;
  const someEventsSelected = selectedEvents.size > 0 && !allEventsSelected;

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
          {/* Selection checkbox (not in group mode) */}
          {!groupMode && !isChild && (
            <div className="flex items-center gap-2">
              <Checkbox
                checked={selectedFields.has(field.id)}
                onCheckedChange={() => toggleFieldSelection(field.id)}
              />
            </div>
          )}

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

          {/* Title (Key) selector - searchable */}
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Título</Label>
            <SearchableFieldSelect
              value={field.assignedKey}
              options={allStrings}
              onSelect={(val) => updateField(field.id, { assignedKey: val })}
              placeholder="Selecionar título..."
            />
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

          {/* Value selector - searchable */}
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Valor</Label>
            <SearchableFieldSelect
              value={field.assignedValue}
              options={allStrings}
              onSelect={(val) => updateField(field.id, { assignedValue: val })}
              placeholder="Selecionar valor..."
            />
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
              <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={() => ungroupField(field.id)}>
                <X className="h-3 w-3" />
                Desagrupar
              </Button>
            )}
          </div>

          {/* Render children */}
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

      {/* Tabs: Campos / Eventos */}
      {events.length > 0 && (
        <div className="flex gap-1 border-b border-border">
          <button
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'fields' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
            onClick={() => setActiveTab('fields')}
          >
            Campos ({fields.length})
          </button>
          <button
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'events' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
            onClick={() => setActiveTab('events')}
          >
            Eventos/Tabela ({events.length})
          </button>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap gap-2 items-center">
        {templates.length > 0 && activeTab === 'fields' && (
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
          {activeTab === 'fields' && groupMode ? (
            <>
              <Button variant="outline" size="sm" onClick={() => { setGroupMode(false); setSelectedForGroup([]); }}>
                <X className="h-4 w-4 mr-1" /> Cancelar
              </Button>
              <Button size="sm" onClick={createGroup} disabled={selectedForGroup.length < 2}>
                <Plus className="h-4 w-4 mr-1" /> Criar Grupo ({selectedForGroup.length})
              </Button>
            </>
          ) : (
            <>
              {activeTab === 'fields' && (
                <Button variant="outline" size="sm" onClick={() => setGroupMode(true)}>
                  <GripVertical className="h-4 w-4 mr-1" /> Agrupar Campos
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={() => setSaveDialogOpen(true)}>
                <BookTemplate className="h-4 w-4 mr-1" /> Salvar como Modelo
              </Button>
              <Button size="sm" onClick={handleApplyChanges}>
                <Check className="h-4 w-4 mr-1" /> Aplicar Alterações
              </Button>
            </>
          )}
        </div>
      </div>

      {groupMode && activeTab === 'fields' && (
        <div className="bg-accent/50 border border-accent rounded-md p-3 text-sm text-accent-foreground">
          Selecione os campos para agrupar. O primeiro selecionado será o <strong>campo pai</strong>.
        </div>
      )}

      {/* FIELDS TAB */}
      {activeTab === 'fields' && (
        <>
          {/* Bulk selection bar */}
          {!groupMode && (
            <div className="flex items-center gap-3 p-2 bg-muted/30 rounded-md border border-border/50">
              <button
                onClick={allFieldsSelected ? deselectAllFields : selectAllFields}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {allFieldsSelected ? (
                  <CheckSquare className="h-4 w-4 text-primary" />
                ) : someFieldsSelected ? (
                  <MinusSquare className="h-4 w-4 text-primary" />
                ) : (
                  <Square className="h-4 w-4" />
                )}
                {allFieldsSelected ? 'Desmarcar todos' : 'Selecionar todos'}
              </button>

              {selectedFields.size > 0 && (
                <div className="flex items-center gap-1.5 ml-auto">
                  <span className="text-xs text-muted-foreground">{selectedFields.size} selecionado(s)</span>
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => bulkAction('validated')}>
                    <Check className="h-3 w-3 mr-1" /> OK
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => bulkAction('ignored')}>
                    <EyeOff className="h-3 w-3 mr-1" /> Ignorar
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => bulkAction('pending')}>
                    Resetar
                  </Button>
                </div>
              )}
            </div>
          )}

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {topLevelFields.map(field => renderFieldCard(field))}
          </div>
        </>
      )}

      {/* EVENTS TAB */}
      {activeTab === 'events' && (
        <>
          {/* Bulk selection bar for events */}
          <div className="flex items-center gap-3 p-2 bg-muted/30 rounded-md border border-border/50">
            <button
              onClick={allEventsSelected ? deselectAllEvents : selectAllEvents}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {allEventsSelected ? (
                <CheckSquare className="h-4 w-4 text-primary" />
              ) : someEventsSelected ? (
                <MinusSquare className="h-4 w-4 text-primary" />
              ) : (
                <Square className="h-4 w-4" />
              )}
              {allEventsSelected ? 'Desmarcar todos' : 'Selecionar todos'}
            </button>

            {selectedEvents.size > 0 && (
              <div className="flex items-center gap-1.5 ml-auto">
                <span className="text-xs text-muted-foreground">{selectedEvents.size} selecionado(s)</span>
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => bulkEventAction('validated')}>
                  <Check className="h-3 w-3 mr-1" /> OK
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => bulkEventAction('ignored')}>
                  <EyeOff className="h-3 w-3 mr-1" /> Ignorar
                </Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => bulkEventAction('pending')}>
                  Resetar
                </Button>
              </div>
            )}
          </div>

          <ScrollArea className="max-h-[500px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10"></TableHead>
                  <TableHead className="text-xs">CÓD.</TableHead>
                  <TableHead className="text-xs">Descrição</TableHead>
                  <TableHead className="text-xs">QTDE.</TableHead>
                  <TableHead className="text-xs">Vencimentos</TableHead>
                  <TableHead className="text-xs">Descontos</TableHead>
                  <TableHead className="text-xs w-24">Status</TableHead>
                  <TableHead className="text-xs w-24">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map(ev => (
                  <TableRow
                    key={ev.id}
                    className={
                      ev.status === 'validated' ? 'bg-primary/5' :
                      ev.status === 'ignored' ? 'bg-muted/30 opacity-60' : ''
                    }
                  >
                    <TableCell>
                      <Checkbox
                        checked={selectedEvents.has(ev.id)}
                        onCheckedChange={() => toggleEventSelection(ev.id)}
                      />
                    </TableCell>
                    <TableCell className="text-xs font-mono">{ev.codigo}</TableCell>
                    <TableCell>
                      <Input
                        value={ev.descricao}
                        onChange={e => updateEvent(ev.id, { descricao: e.target.value })}
                        className="h-7 text-xs"
                      />
                    </TableCell>
                    <TableCell className="text-xs">{ev.referencia}</TableCell>
                    <TableCell>
                      <Input
                        value={ev.vencimento}
                        onChange={e => updateEvent(ev.id, { vencimento: e.target.value })}
                        className="h-7 text-xs w-24"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={ev.desconto}
                        onChange={e => updateEvent(ev.id, { desconto: e.target.value })}
                        className="h-7 text-xs w-24"
                      />
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={ev.status === 'validated' ? 'default' : ev.status === 'ignored' ? 'destructive' : 'secondary'}
                        className="text-[10px]"
                      >
                        {ev.status === 'validated' ? 'OK' : ev.status === 'ignored' ? 'Ignorado' : 'Pendente'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant={ev.status === 'validated' ? 'default' : 'ghost'}
                          className="h-6 w-6 p-0"
                          onClick={() => toggleEventValidated(ev.id)}
                        >
                          <Check className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant={ev.status === 'ignored' ? 'destructive' : 'ghost'}
                          className="h-6 w-6 p-0"
                          onClick={() => toggleEventIgnored(ev.id)}
                        >
                          <EyeOff className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {events.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-8">
                      Nenhum evento/tabela encontrado neste documento.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </>
      )}

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
              <Save className="h-4 w-4 mr-1" /> Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ValidationView;
