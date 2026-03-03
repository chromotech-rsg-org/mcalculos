import React, { useState, useMemo } from 'react';
import { Check, ChevronsUpDown, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';


interface SearchableFieldSelectProps {
  value: string;
  options: string[];
  onSelect: (value: string) => void;
  onCustomSelect?: (value: string) => void;
  placeholder?: string;
  className?: string;
}

const SearchableFieldSelect: React.FC<SearchableFieldSelectProps> = ({
  value,
  options,
  onSelect,
  onCustomSelect,
  placeholder = 'Selecionar...',
  className,
}) => {
  const [open, setOpen] = useState(false);

  const displayValue = value
    ? value.length > 40 ? value.substring(0, 40) + '…' : value
    : placeholder;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn('w-full justify-between h-8 text-xs font-normal', className)}
        >
          <span className="truncate">{displayValue}</span>
          <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0 z-50" align="start">
        <Command>
          <CommandInput placeholder="Buscar..." className="h-8 text-xs" />
          <CommandList className="max-h-[250px] overflow-y-auto">
            <CommandEmpty>Nenhum resultado.</CommandEmpty>
            <CommandGroup>
              {/* Custom option first */}
              <CommandItem
                value="__custom__"
                onSelect={() => {
                  const custom = prompt('Digite o valor personalizado:', value);
                  if (custom?.trim()) {
                    if (onCustomSelect) {
                      onCustomSelect(custom.trim());
                    } else {
                      onSelect(custom.trim());
                    }
                  }
                  setOpen(false);
                }}
                className="text-xs"
              >
                <Pencil className="mr-2 h-3 w-3 text-muted-foreground" />
                <span className="italic text-muted-foreground">✏️ Digitar personalizado...</span>
              </CommandItem>
              {options.map((opt) => (
                <CommandItem
                  key={opt}
                  value={opt}
                  onSelect={() => {
                    onSelect(opt);
                    setOpen(false);
                  }}
                  className="text-xs"
                >
                  <Check
                    className={cn(
                      'mr-2 h-3 w-3',
                      value === opt ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                  <span className={cn(value === opt && 'font-bold', 'truncate')}>
                    {opt.length > 60 ? opt.substring(0, 60) + '…' : opt}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

export default SearchableFieldSelect;
