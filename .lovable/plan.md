
# Refactoring: Extraction 100% Dynamic with Unified Data Flow

## Problem

The extraction now captures fields dynamically in `month.fields[]`, but three critical components still use the old hardcoded `ExtractedMonth` properties (`empresa`, `cnpj`, `salarioBase`, etc.):

1. **Export (`export.ts`)** -- builds Excel/CSV rows from hardcoded property names, ignoring `fields[]`
2. **DataTableView** -- defines columns from hardcoded properties, ignoring `fields[]`
3. **`extractPattern1aPage`** -- duplicates data by writing the same values into both `fields[]` AND typed properties (`month.empresa`, `month.cnpj`, etc.)

This means dynamic fields extracted from varied layouts (Centro de Ensino, Keypar, A.L. IND COM) are visible in the detail view but lost when exporting or viewing in the table.

## Solution

Unify everything around `month.fields[]` as the single source of truth for all non-event data. Events remain in `month.eventos[]`.

---

## Technical Changes

### 1. Simplify `extractPattern1aPage` (pattern1a.ts)

- Remove duplicate writes to typed properties. Only populate `fields[]` and `eventos[]`.
- Keep `month.month` (period string) and `month.competencia` for display/sorting.
- Keep `month.eventos`, `month.totalVencimentos`, `month.totalDescontos`, `month.valorLiquido` (these are summary fields derived from the events table).
- Remove population of `month.empresa`, `month.cnpj`, `month.nomeFuncionario`, `month.cargo`, `month.dataAdmissao`, etc. -- these are now in `fields[]` only.
- Improve `extractAllFields` to better handle the A.L. IND COM layout:
  - Recognize "Agencia:" with colon and "ITAU 4446 341" as bank info
  - Recognize "conta corrente:" as a labeled field
  - Handle "Sal. Contr. INSS", "Base Calc. FGTS", "F.G.T.S do Mes", "Base Calc. IRRF", "Faixa IRRF" labels (with abbreviated/variant names)
  - Skip "A TRANSPORTAR" continuation markers and "Declaro ter recebido" text
  - Skip "PARABENS PELO SEU ANIVERSARIO" messages (add to structural filter)
  - Filter out duplicate data (same field appearing in top and bottom halves of the page since the PDF has 2 copies per page)

### 2. Update Export (`export.ts`)

Replace the hardcoded `buildExcelRows` and `getOrderedHeaders` with dynamic logic:

- **Collect all unique field keys** across all months from `fields[]`
- **Order columns**: Period/Competencia first, then alphabetical or by first-appearance order for field keys, then event columns, then totals
- **Build rows** by looking up `month.fields.find(f => f.key === columnKey)?.value`
- Events columns remain as before (codigo, descricao, referencia, vencimento, desconto per event line)
- This ensures every field from every layout variation appears in the export

### 3. Update DataTableView (`DataTableView.tsx`)

- Replace hardcoded `getBaseColumns()` with dynamic column discovery from `data.months[*].fields[*].key`
- Collect all unique field keys across all months
- Each column's `getValue` looks up from `month.fields[]`
- Event columns remain as before
- Column visibility preferences still work (stored by key)

### 4. Update DocumentDetail display (`DocumentDetail.tsx`)

- The detail view already renders `month.fields[]` dynamically -- minor cleanup only
- Ensure the events table section still displays properly
- Show `totalVencimentos`, `totalDescontos`, `valorLiquido` from `month` properties (they are summary values from event parsing)

### 5. Improve extraction robustness (pattern1a.ts)

- **Duplicate page filtering**: Many PDFs have 2 copies of the same payslip on one page (employer + employee copy). Detect and skip the second copy by checking if the same "Total de Vencimentos" value appears twice on the same page.
- **"A TRANSPORTAR" handling**: When a payslip spans 2 pages, the first page ends with "A TRANSPORTAR" and the second continues. Merge events from continuation pages into the previous month.
- **Better footer field extraction**: Scan lines after the events table for footer fields like "Salario Base", "Base Calc. FGTS", etc. using the same generic label-value approach. The current `extractFooter` function is separate and not feeding into `fields[]` -- integrate it.
- **Bank info integration**: Move bank info into `fields[]` instead of separate properties.
- **Confidence tagging**: For now, skip "[baixa confianca]" tagging -- the positional extraction is reliable enough. Can be added later if OCR is integrated.
- **observacoes_extras**: Capture birthday messages ("PARABENS...") and other non-standard text into a field called "Observacoes" in `fields[]`.

### Files to modify

| File | Change |
|---|---|
| `src/lib/extraction-patterns/pattern1a.ts` | Integrate footer/bank into `extractAllFields`, remove duplicate property writes, handle "A TRANSPORTAR" continuation, filter duplicate copies |
| `src/lib/export.ts` | Dynamic columns from `fields[]`, dynamic headers |
| `src/components/documents/DataTableView.tsx` | Dynamic columns from `fields[]` |
| `src/pages/DocumentDetail.tsx` | Minor cleanup, show totals section properly |
| `src/types/index.ts` | No changes needed -- `fields[]` already exists on `ExtractedMonth` |
