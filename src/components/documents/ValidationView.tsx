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
import { getTemplates, saveTemplate, deleteTemplate, generateId } from '@/lib/supabase-storage';
import SearchableFieldSelect from './SearchableFieldSelect';

interface ValidationViewProps {
  data: ExtractedData;
  onUpdate: (data: ExtractedData) => void;
}

/** Sub-component for Add Field dialog content */
const AddFieldContent: React.FC<{
  allKeys: string[];
  allValues: string[];
  onAdd: (key: string, value: string) => void;
  onCancel: () => void;
}> = ({ allKeys, allValues, onAdd, onCancel }) => {
  const [search, setSearch] = useState('');
  const [selectedKey, setSelectedKey] = useState('');
  const [selectedValue, setSelectedValue] = useState('');

  // Merge all keys and values into a single list of available items
  const allItems = useMemo(() => {
    const items: { text: string; type: 'key' | 'value' }[] = [];
    const seen = new Set<string>();
    for (const k of allKeys) {
      if (!seen.has(k)) { seen.add(k); items.push({ text: k, type: 'key' }); }
    }
    for (const v of allValues) {
      if (!seen.has(v)) { seen.add(v); items.push({ text: v, type: 'value' }); }
    }
    return items;
  }, [allKeys, allValues]);

  const filtered = useMemo(() => {
    if (!search) return allItems;
    const lower = search.toLowerCase();
    return allItems.filter(i => i.text.toLowerCase().includes(lower));
  }, [allItems, search]);

  return (
    <div className="space-y-3">
      <Input
        placeholder="Buscar título ou valor..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        autoFocus
      />
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Título</Label>
          <SearchableFieldSelect
            value={selectedKey}
            options={allKeys}
            onSelect={setSelectedKey}
            placeholder="Selecionar título..."
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Valor</Label>
          <SearchableFieldSelect
            value={selectedValue}
            options={allValues}
            onSelect={setSelectedValue}
            placeholder="Selecionar valor..."
          />
        </div>
      </div>

      {search && (
        <ScrollArea className="h-48 border rounded-md">
          <div className="p-2 space-y-1">
            {filtered.map((item, idx) => (
              <button
                key={idx}
                className="w-full text-left px-2 py-1.5 text-xs rounded hover:bg-accent transition-colors flex items-center justify-between"
                onClick={() => {
                  if (item.type === 'key') setSelectedKey(item.text);
                  else setSelectedValue(item.text);
                }}
              >
                <span className="truncate">{item.text}</span>
                <Badge variant="outline" className="text-[9px] px-1 py-0 ml-2 flex-shrink-0">
                  {item.type === 'key' ? 'título' : 'valor'}
                </Badge>
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-4">Nenhum resultado</p>
            )}
          </div>
        </ScrollArea>
      )}

      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>Cancelar</Button>
        <Button
          onClick={() => onAdd(selectedKey || search, selectedValue || search)}
          disabled={!selectedKey && !selectedValue && !search}
        >
          <Plus className="h-4 w-4 mr-1" /> Adicionar
        </Button>
      </DialogFooter>
    </div>
  );
};


interface FieldState {
  id: string;
  /** The original key from extraction */
  originalKey: string;
  /** The assigned/renamed key */
  assignedKey: string;
  /** Sample value from first month (for display only) */
  sampleValue: string;
  /** How the value was assigned */
  valueSource: 'original' | 'custom' | 'mapped';
  /** Custom value typed by user (applies to ALL months) */
  customValue?: string;
  /** If mapped: the original key whose per-month values should be used */
  mappedToKey?: string;
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
  const [addFieldDialogOpen, setAddFieldDialogOpen] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templates, setTemplates] = useState<ExtractionTemplate[]>([]);
  const [groupMode, setGroupMode] = useState(false);
  const [selectedForGroup, setSelectedForGroup] = useState<string[]>([]);
  const [selectedFields, setSelectedFields] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<'fields' | 'events'>('fields');

  // Load templates from DB
  React.useEffect(() => {
    getTemplates().then(setTemplates);
  }, []);

  // Collect all event keys to exclude from fields tab
  const eventKeys = useMemo(() => {
    const keys = new Set<string>();
    data.months.forEach(month => {
      month.eventos?.forEach(ev => {
        if (ev.descricao) keys.add(ev.descricao.trim().toLowerCase());
      });
    });
    return keys;
  }, [data]);

  // Build unique field list (by key) across all months - exclude event-like fields
  const initialFields = useMemo(() => {
    const seen = new Map<string, FieldState>();
    data.months.forEach(month => {
      month.fields?.forEach(f => {
        // Skip fields that are actually event descriptions
        if (eventKeys.has(f.key.trim().toLowerCase())) return;

        if (!seen.has(f.key)) {
          seen.set(f.key, {
            id: f.key,
            originalKey: f.key,
            assignedKey: f.key,
            sampleValue: f.value,
            valueSource: 'original',
            status: 'pending',
          });
        }
      });
    });
    return Array.from(seen.values());
  }, [data, eventKeys]);

  // Build events list (unique across all months)
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

  // Pool of all unique strings (keys + values) for the "title" dropdown
  const allKeys = useMemo(() => {
    const set = new Set<string>();
    data.months.forEach(month => {
      month.fields?.forEach(f => {
        if (f.key?.trim()) set.add(f.key.trim());
      });
    });
    return Array.from(set).sort();
  }, [data]);

  // Pool of all unique values for the "value" dropdown
  const allValues = useMemo(() => {
    const set = new Set<string>();
    data.months.forEach(month => {
      month.fields?.forEach(f => {
        if (f.value?.trim()) set.add(f.value.trim());
      });
    });
    return Array.from(set).sort();
  }, [data]);

  // Build a reverse map: value → original key (for mapping)
  const valueToOriginalKey = useMemo(() => {
    const map = new Map<string, string>();
    data.months.forEach(month => {
      month.fields?.forEach(f => {
        if (f.value?.trim() && f.key?.trim()) {
          if (!map.has(f.value.trim())) {
            map.set(f.value.trim(), f.key.trim());
          }
        }
      });
    });
    return map;
  }, [data]);

  // Check if a value varies across months for a given key
  const fieldVariesPerMonth = useCallback((key: string): boolean => {
    const values = new Set<string>();
    data.months.forEach(month => {
      const f = month.fields?.find(f => f.key === key);
      if (f?.value) values.add(f.value);
    });
    return values.size > 1;
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

  const handleKeySelect = useCallback((id: string, val: string) => {
    updateField(id, { assignedKey: val });
  }, [updateField]);

  const handleValueSelect = useCallback((id: string, val: string, isCustomTyped: boolean) => {
    if (isCustomTyped) {
      // User typed a custom value → apply same to all months
      updateField(id, { valueSource: 'custom', customValue: val, sampleValue: val, mappedToKey: undefined });
    } else {
      // User selected from pool → find which original key owns this value
      const sourceKey = valueToOriginalKey.get(val);
      if (sourceKey) {
        // Map this field to use the source key's per-month values
        updateField(id, { valueSource: 'mapped', mappedToKey: sourceKey, sampleValue: val, customValue: undefined });
      } else {
        // Value not found in any field - treat as custom
        updateField(id, { valueSource: 'custom', customValue: val, sampleValue: val, mappedToKey: undefined });
      }
    }
  }, [updateField, valueToOriginalKey]);

  const swapKeyValue = useCallback((id: string) => {
    setFields(prev => prev.map(f => {
      if (f.id !== id) return f;
      return {
        ...f,
        assignedKey: f.sampleValue,
        sampleValue: f.assignedKey,
        valueSource: 'mapped',
        mappedToKey: f.originalKey, // keep relationship
      };
    }));
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

  const selectAllFields = () => setSelectedFields(new Set(topLevelFields.map(f => f.id)));
  const deselectAllFields = () => setSelectedFields(new Set());

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
      if (f.id === parentId) {
        // Parent keeps its title; children will contribute only values
        return { ...f, children: [...(f.children || []), ...childIds] };
      }
      if (childIds.includes(f.id)) return { ...f, parentId };
      return f;
    }));
    toast({ title: 'Grupo criado! O título do pai será mantido, apenas os valores dos filhos serão agrupados.' });
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

  const deleteField = useCallback((id: string) => {
    setFields(prev => {
      const field = prev.find(f => f.id === id);
      if (!field) return prev;
      // If deleting a parent, ungroup its children first
      const childIds = field.children || [];
      return prev
        .filter(f => f.id !== id)
        .map(f => childIds.includes(f.id) ? { ...f, parentId: undefined } : f);
    });
    toast({ title: 'Campo excluído' });
  }, [toast]);

  const addNewField = useCallback((key: string, value: string) => {
    const newId = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const newField: FieldState = {
      id: newId,
      originalKey: key,
      assignedKey: key,
      sampleValue: value,
      valueSource: 'custom',
      customValue: value,
      status: 'pending',
    };
    setFields(prev => [...prev, newField]);
    setAddFieldDialogOpen(false);
    toast({ title: 'Campo adicionado!' });
  }, [toast]);

  // Apply changes: per-month value resolution
  const applyToData = (): ExtractedData => {
    const updatedMonths = data.months.map(month => {
      // Build updated fields for this month
      const updatedFields = fields
        .filter(f => f.status !== 'ignored' && !f.parentId) // Only top-level fields
        .map(f => {
          let value: string;
          if (f.valueSource === 'custom' && f.customValue !== undefined) {
            value = f.customValue;
          } else if (f.valueSource === 'mapped' && f.mappedToKey) {
            const sourceField = month.fields?.find(mf => mf.key === f.mappedToKey);
            value = sourceField?.value || f.sampleValue;
          } else {
            const originalField = month.fields?.find(mf => mf.key === f.originalKey);
            value = originalField?.value || f.sampleValue;
          }

          // If this field has children, concatenate their values
          const children = fields.filter(c => c.parentId === f.id && c.status !== 'ignored');
          if (children.length > 0) {
            const childValues = children.map(c => {
              if (c.valueSource === 'custom' && c.customValue !== undefined) return c.customValue;
              if (c.valueSource === 'mapped' && c.mappedToKey) {
                const src = month.fields?.find(mf => mf.key === c.mappedToKey);
                return src?.value || c.sampleValue;
              }
              const orig = month.fields?.find(mf => mf.key === c.originalKey);
              return orig?.value || c.sampleValue;
            }).filter(Boolean);
            if (childValues.length > 0) {
              value = [value, ...childValues].filter(Boolean).join('\n');
            }
          }

          return { key: f.assignedKey, value };
        });

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
              referencia: ev.referencia,
              vencimento: ev.vencimento,
              desconto: ev.desconto,
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

  const handleSaveTemplate = async () => {
    if (!templateName.trim()) return;
    const mappings: FieldMapping[] = fields.map(f => ({
      originalKey: f.originalKey,
      mappedKey: f.assignedKey,
      ignore: f.status === 'ignored',
      validated: f.status === 'validated',
      parentKey: f.parentId ? fields.find(p => p.id === f.parentId)?.originalKey : undefined,
    }));
    const template: ExtractionTemplate = {
      id: generateId(),
      name: templateName.trim(),
      field_mappings: mappings,
      created_at: new Date().toISOString(),
    };
    await saveTemplate(template);
    getTemplates().then(setTemplates);
    setSaveDialogOpen(false);
    setTemplateName('');
    handleApplyChanges();
    toast({ title: 'Modelo salvo com agrupamentos!' });
  };

  const handleApplyTemplate = (templateId: string) => {
    const tmpl = templates.find(t => t.id === templateId);
    if (!tmpl) return;
    setFields(prev => {
      // First pass: apply mappings and status
      let updated = prev.map(f => {
        const mapping = tmpl.field_mappings.find(m => m.originalKey === f.originalKey);
        if (mapping) {
          return {
            ...f,
            assignedKey: mapping.mappedKey,
            status: mapping.ignore ? 'ignored' as const : mapping.validated ? 'validated' as const : 'pending' as const,
            parentId: undefined,
            children: undefined,
          };
        }
        return { ...f, parentId: undefined, children: undefined };
      });
      
      // Second pass: restore groupings from template
      for (const mapping of tmpl.field_mappings) {
        if (mapping.parentKey) {
          const childField = updated.find(f => f.originalKey === mapping.originalKey);
          const parentField = updated.find(f => f.originalKey === mapping.parentKey);
          if (childField && parentField) {
            childField.parentId = parentField.id;
            if (!parentField.children) parentField.children = [];
            if (!parentField.children.includes(childField.id)) {
              parentField.children.push(childField.id);
            }
          }
        }
      }
      
      return updated;
    });
    toast({ title: 'Modelo aplicado com agrupamentos!' });
  };

  const handleDeleteTemplate = async (templateId: string) => {
    await deleteTemplate(templateId);
    getTemplates().then(setTemplates);
    toast({ title: 'Modelo excluído' });
  };

  const allFieldsSelected = topLevelFields.length > 0 && selectedFields.size === topLevelFields.length;
  const someFieldsSelected = selectedFields.size > 0 && !allFieldsSelected;
  const allEventsSelected = events.length > 0 && selectedEvents.size === events.length;
  const someEventsSelected = selectedEvents.size > 0 && !allEventsSelected;

  const renderFieldCard = (field: FieldState, isChild = false) => {
    const children = fields.filter(f => f.parentId === field.id);
    const varies = field.valueSource === 'original' && fieldVariesPerMonth(field.originalKey);

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
          {/* Selection checkbox */}
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

          {/* Title (Key) selector */}
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Título</Label>
            <SearchableFieldSelect
              value={field.assignedKey}
              options={allKeys}
              onSelect={(val) => handleKeySelect(field.id, val)}
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

          {/* Value selector */}
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Valor
              {varies && (
                <Badge variant="outline" className="ml-1 text-[9px] px-1 py-0 font-normal">
                  varia por holerite
                </Badge>
              )}
            </Label>
            <SearchableFieldSelect
              value={field.sampleValue}
              options={allValues}
              onSelect={(val) => handleValueSelect(field.id, val, false)}
              onCustomSelect={(val) => handleValueSelect(field.id, val, true)}
              placeholder="Selecionar valor..."
            />
          </div>

          {/* Source indicator */}
          <div className="flex flex-wrap gap-1">
            {field.assignedKey !== field.originalKey && (
              <Badge variant="secondary" className="text-[10px] px-1 py-0">
                título: era "{field.originalKey.substring(0, 20)}"
              </Badge>
            )}
            {field.valueSource === 'custom' && (
              <Badge variant="secondary" className="text-[10px] px-1 py-0">
                valor fixo (todos holerites)
              </Badge>
            )}
            {field.valueSource === 'mapped' && field.mappedToKey && field.mappedToKey !== field.originalKey && (
              <Badge variant="secondary" className="text-[10px] px-1 py-0">
                mapeado: {field.mappedToKey.substring(0, 20)}
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
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs gap-1 text-destructive hover:text-destructive"
              onClick={() => deleteField(field.id)}
            >
              <Trash2 className="h-3 w-3" />
              Excluir
            </Button>
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
                    {t.name} ({t.field_mappings.length} regras)
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
                <>
                  <Button variant="outline" size="sm" onClick={() => setGroupMode(true)}>
                    <GripVertical className="h-4 w-4 mr-1" /> Agrupar Campos
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setAddFieldDialogOpen(true)}>
                    <Plus className="h-4 w-4 mr-1" /> Adicionar Campo
                  </Button>
                </>
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

          <div className="border rounded-md">
            <ScrollArea className="h-[500px]">
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
          </div>
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

      {/* Add Field Dialog */}
      <Dialog open={addFieldDialogOpen} onOpenChange={setAddFieldDialogOpen}>
        <DialogContent className="max-w-lg max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Adicionar Campo</DialogTitle>
            <DialogDescription>
              Selecione um título e valor extraídos do documento para criar um novo campo.
            </DialogDescription>
          </DialogHeader>
          <AddFieldContent
            allKeys={allKeys}
            allValues={allValues}
            onAdd={addNewField}
            onCancel={() => setAddFieldDialogOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ValidationView;
