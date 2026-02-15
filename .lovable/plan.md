

# Extraction by Payslip Pattern (Modelo "1a")

## Problem Analysis

The current extraction engine uses generic regex patterns that fail to capture the specific structure of each payslip model. After analyzing the uploaded PDF ("1a - Holerite Normal - A.L. IND COM"), I identified the following gaps:

**Current issues:**
- **Period detection fails**: The code looks for keywords like "competencia/referencia/mes/periodo" but in model 1a the period is in "Folha Mensal" followed by "Marco de 2022" on the next text segment
- **Employee name not captured**: The regex expects "nome/funcionario/empregado:" prefix, but in 1a the name is in a table row like "194 LUCAS PEREIRA GONCALVES"
- **Table data poorly parsed**: The generic table regex `(\d{3,4})\s+([A-Z...]+)\s+([\d.,]+)` only captures one value per row, but 1a rows have both Referencia AND Vencimentos/Descontos columns
- **Footer fields missed**: Salario Base, Sal. Contr. INSS, Base Calc. FGTS, F.G.T.S do Mes, Base Calc. IRRF, Faixa IRRF are in a separate footer row that the current code ignores

**Model 1a structure (per page = 1 month):**

```text
HEADER:
  Company Name
  CNPJ: XX.XXX.XXX/XXXX-XX    CC: EXTRUSAO    Folha Mensal
  Mensalista                                    [Mes] de [Ano]
  Codigo | Nome do Funcionario | CBO | Depto | Filial
  194      LUCAS PEREIRA GONCALVES   722415   1       1
  OP. DE SERRA E ESTICADEIRA JR.  Admissao: 04/03/2022

TABLE (line items):
  Codigo | Descricao              | Referencia | Vencimentos | Descontos
  8781     DIAS NORMAIS             28,00        2.009,65
  250      REFLEXO EXTRAS DSR       0,00         32,69
  998      I.N.S.S.                 8,25                       199,63
  217      VALE TRANSPORTE 6%       6,00                       120,58

TOTALS:
  Total de Vencimentos: 2.420,21
  Total de Descontos: 1.325,21
  Valor Liquido: 1.095,00

FOOTER:
  Salario Base | Sal. Contr. INSS | Base Calc. FGTS | F.G.T.S do Mes | Base Calc. IRRF | Faixa IRRF
  2.224,97       2.420,16           2.420,16           193,61            1.026,11           0,00
```

## Implementation Plan

### 1. Add `payslipPattern` field to the data model

Update `src/types/index.ts` to include a pattern identifier on `ExtractedData` and `Document`:

- Add `payslipPattern?: string` to `ExtractedData` (e.g., "1a", "2a", "3a", etc.)
- This lets the extraction engine choose the correct parsing strategy

### 2. Create pattern-specific extraction module

Create `src/lib/extraction-patterns/pattern1a.ts` with a dedicated extractor for model 1a:

**Period extraction**: Look for "Folha Mensal" followed by a month name pattern like "Marco de 2022" or "Maio de 2022"

**Employee name**: Parse the line containing a 3-digit code followed by a name in all caps: `(\d{3})\s+([A-Z\s]+)`

**Table parsing**: Parse lines matching the pattern `Codigo | Descricao | Referencia | Vencimentos | Descontos` by:
- Detecting numeric codes (3-4 digits) at start of line
- Capturing description text
- Capturing reference value
- Distinguishing whether the monetary value goes in Vencimentos or Descontos column based on position

**Footer parsing**: Capture the 6 footer fields by detecting the row after bank/account info:
- Salario Base
- Sal. Contr. INSS
- Base Calc. FGTS
- F.G.T.S do Mes
- Base Calc. IRRF
- Faixa IRRF

**Fields extracted per month** (columns in the output table):
- DIAS NORMAIS (reference + value)
- REFLEXO EXTRAS DSR
- REFLEXO ADIC. NOTURNO DSR
- HORAS EXTRAS 50%
- HORAS EXTRAS 60%
- HORA EXTRA 50% c/ADICIONAL NOTURNO 35%
- HORA EXTRA 60% c/ADICIONAL NOTURNO 35%
- TROCO DO MES
- ADICIONAL NOTURNO 35%
- I.N.S.S.
- DESCONTO TROCO ADTO. SAL.
- DESC.ADIANT.SALARIAL
- VALE TRANSPORTE 6%
- HORAS FALTAS PARCIAL
- DESCONTO DE MERCADORIA
- Total de Vencimentos
- Total de Descontos
- Valor Liquido
- Salario Base
- Sal. Contr. INSS
- Base Calc. FGTS
- F.G.T.S do Mes
- Base Calc. IRRF
- Faixa IRRF

Each rubric that appears in any month becomes a column; months become rows.

### 3. Create pattern detection logic

Create `src/lib/extraction-patterns/detector.ts`:

- Auto-detect pattern "1a" by checking for "Folha Mensal" + the specific table header format (Codigo | Descricao | Referencia | Vencimentos | Descontos) + footer row with "Salario Base | Sal. Contr. INSS | ..."
- Return the detected pattern string or "generic" as fallback

### 4. Refactor main extraction.ts

Update `src/lib/extraction.ts`:

- Import the pattern detector and pattern-specific extractors
- In `extractDataFromPDF`, after extracting raw text from each page:
  1. Detect the payslip pattern from the first page's text
  2. Route to the appropriate pattern extractor
  3. The pattern extractor returns properly structured `ExtractedMonth[]` with all fields

### 5. Add pattern selector in UploadModal

Update `src/components/documents/UploadModal.tsx`:

- Add an optional "Modelo do Holerite" dropdown with options: "Auto-detectar", "1a - Holerite Normal (A.L. IND COM)", etc.
- Store the selected pattern in the Document so the extraction can use it if auto-detection fails
- Default to "Auto-detectar"

### 6. Show detected pattern in DocumentDetail

Update `src/pages/DocumentDetail.tsx`:

- Display the detected/selected pattern in the info section (e.g., "Modelo: 1a")
- Allow re-extraction with a different pattern if needed

## Technical Details

### Pattern 1a Text Parsing Strategy

Since pdf.js joins all text items with spaces, the text for one page looks approximately like:

```
A.L. IND COM IMP EXP ... CNPJ: 09.406.784/0002-08 CC: EXTRUSAO Folha Mensal Mensalista Marco de 2022 ... 194 LUCAS PEREIRA GONCALVES 722415 1 1 ... 8781 DIAS NORMAIS 28,00 2.009,65 ... Total de Vencimentos 2.420,21 Total de Descontos 1.325,21 ... Valor Liquido 1.095,00 ... Salario Base Sal. Contr. INSS Base Calc. FGTS F.G.T.S do Mes Base Calc. IRRF Faixa IRRF 2.224,97 2.420,16 2.420,16 193,61 1.026,11 0,00
```

Key regex patterns for 1a:
- Period: `/Folha\s+Mensal\s+.*?((?:Janeiro|Fevereiro|Marco|Abril|Maio|Junho|Julho|Agosto|Setembro|Outubro|Novembro|Dezembro)\s+de\s+\d{4})/i`
- Employee name: `/(\d{3})\s+([A-Z][A-Z\s]+?)\s+\d{6}/` (code + name before CBO)
- Table items: `/(\d{3,4})\s+([\w\s.%\/]+?)\s+([\d.,]+)\s+([\d.,]+)/g` (captures both ref + value)
- Footer values: sequence of 6 decimal numbers after "Faixa IRRF" text

### File Structure

```
src/lib/extraction-patterns/
  detector.ts          -- Auto-detect payslip model
  pattern1a.ts         -- Extractor for model 1a
  index.ts             -- Export all patterns
src/lib/extraction.ts  -- Updated to use pattern system
src/types/index.ts     -- Add payslipPattern field
```

