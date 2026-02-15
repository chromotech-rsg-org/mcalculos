

# Correcao da Extracao do Modelo 1a - Abordagem por Layout Visual

## Diagnostico do Problema

O pdf.js extrai texto como uma lista flat de items com coordenadas (x, y), mas o codigo atual junta tudo com `.join(' ')`, perdendo completamente a informacao de posicao. O resultado e uma string unica onde as regex nao conseguem distinguir colunas (Vencimentos vs Descontos), identificar blocos (cabecalho vs tabela vs rodape), nem separar o cargo dos eventos.

Evidencia na screenshot: so 1 evento foi extraido, e e o cargo ("OP. DE SERRA E ESTICADEIRA JR.") confundido com evento. Campos como Nome, CBO, Departamento, Filial ficaram vazios.

## Solucao

Reescrever a extracao para usar as coordenadas (x, y) dos text items do pdf.js, reconstruindo linhas e colunas pela posicao visual.

## Detalhes Tecnicos

### 1. Novo modulo de parsing posicional (`src/lib/extraction-patterns/pdf-layout.ts`)

Criar funcoes utilitarias para reconstruir o layout:

- **`extractTextItems(page)`**: Extrair items com `{str, x, y, width, height}` do pdf.js `getTextContent()` (campos `transform[4]` = x, `transform[5]` = y)
- **`groupIntoLines(items)`**: Agrupar items por coordenada Y (tolerancia ~3px) e ordenar por X dentro de cada linha
- **`reconstructLines(items)`**: Gerar array de linhas onde cada linha tem o texto completo e os items posicionais

### 2. Reescrever `pattern1a.ts` com parsing posicional

Substituir todas as regex por logica baseada em blocos:

**Bloco 1 - Cabecalho (linhas 1-3 do PDF):**
- Linha 1: Empresa (texto completo da primeira linha)
- Linha 2: CNPJ (apos "CNPJ:"), CC (apos "CC:"), "Folha Mensal"
- Linha 3: "Mensalista", Competencia (mes de ano)

**Bloco 2 - Funcionario (linhas 4-5):**
- Linha 4: Codigo (3 digitos), Nome (texto em maiusculas), CBO (6 digitos), Departamento, Filial
- Linha 5: Cargo (texto antes de "Admissao:"), Data Admissao

**Bloco 3 - Tabela de Eventos (linhas entre cabecalho de colunas e "Total de Vencimentos"):**
- Detectar o cabecalho da tabela pela presenca de "Codigo", "Descricao", "Vencimentos", "Descontos"
- Guardar as posicoes X das colunas Vencimentos e Descontos
- Para cada linha seguinte ate os totais:
  - Codigo: primeiro numero de 3-4 digitos
  - Descricao: texto entre codigo e referencia
  - Referencia: valor numerico na posicao X da coluna Referencia
  - Vencimento/Desconto: determinar pelo X do valor -- se esta na zona da coluna "Vencimentos" e vencimento, senao e desconto
- Isso resolve o problema principal: distinguir em qual coluna o valor esta

**Bloco 4 - Totais:**
- Procurar linhas com "Total de Vencimentos" e "Total de Descontos"
- Valor Liquido: apos "Valor Liquido"

**Bloco 5 - Rodape financeiro (ultima linha com 6 valores numericos):**
- Identificar a linha que contem "Salario Base", "Sal. Contr. INSS", etc.
- A proxima linha tera os 6 valores na mesma ordem posicional

**Bloco 6 - Dados bancarios:**
- Procurar "ITAU", "conta corrente:", "Agencia:" nas linhas do rodape
- Extrair banco, agencia e conta corrente respeitando a ordem

### 3. Modificar `extractDataFromPDF` em `src/lib/extraction.ts`

- Em vez de `textContent.items.map(item => item.str).join(' ')`, passar os items brutos com coordenadas para o pattern extractor
- Criar duas versoes do texto por pagina:
  1. `rawItems`: array de `{str, x, y}` para parsing posicional
  2. `flatText`: string concatenada para deteccao de pattern (detector.ts)

### 4. Ajustar `extractPattern1a` e `extractPattern1aPage`

- Receber `items: TextItem[]` em vez de `text: string`
- Usar `groupIntoLines(items)` para reconstruir linhas
- Detectar zonas de colunas pela posicao X dos cabecalhos da tabela
- Cada evento recebe vencimento ou desconto com base na posicao X do valor

### Arquivos modificados

| Arquivo | Alteracao |
|---|---|
| `src/lib/extraction-patterns/pdf-layout.ts` | Novo - funcoes de layout posicional |
| `src/lib/extraction-patterns/pattern1a.ts` | Reescrito - usa items posicionais |
| `src/lib/extraction-patterns/index.ts` | Exportar novos tipos |
| `src/lib/extraction.ts` | Passar items posicionais ao pattern extractor |

### Resultado esperado

Todos os 13 eventos do PDF serao extraidos corretamente com:
- Descricoes exatas (DIAS NORMAIS, REFLEXO EXTRAS DSR, etc.)
- Vencimento e Desconto na coluna correta
- Cabecalho completo (Empresa, CNPJ, CC, Nome, CBO, Departamento, Filial, Cargo)
- Rodape completo (Salario Base, bases de INSS/FGTS/IRRF, FGTS do Mes)
- Dados bancarios (Itau, 4446, 36372-5)

