

## Problema

Os holerites PLANOVA sao **relatorios anuais** com estrutura diferente do pattern 1a convencional:

1. **UM cabeçalho por ano** (não por página) - dados do funcionário aparecem apenas na primeira página de cada bloco anual
2. **Eventos com coluna "Mês/Ano"** - cada linha de evento traz o mês a que pertence (ex: `5/2022`, `6/2022`)
3. **Eventos duplicados** - o mesmo código+descrição aparece duas vezes por mês: primeira ocorrência = provento, segunda = desconto
4. **Continuação multi-página** - eventos de um mesmo mês podem cruzar quebras de página
5. **Rodapé com totais** apenas na última página do bloco anual

O sistema atual trata cada página como um holerite independente, o que não funciona para este formato.

### Diferença entre os 2 PDFs
- **PDF 1**: Página 1 tem colunas separadas "Proventos" e "Descontos". Páginas seguintes têm coluna única "Valor" com duplicação de linhas
- **PDF 2**: Mesmo conteúdo, layout ligeiramente diferente no parsing

Ambos seguem o mesmo padrão lógico.

---

## Solução

Criar uma sub-rotina de extração **"relatório anual PLANOVA"** dentro do pattern 1a que detecta e processa este formato.

### 1. Detecção (em `extractPattern1a`)

Antes de iterar página-a-página, verificar se o documento é um relatório anual:
- Presença de coluna "Mês / Ano" ou "Mês/Ano" no header da tabela de eventos
- Título "Demonstrativo de Pagamento Mensal" + eventos com prefixo de data (ex: `5/2022 0034 PAGAMENTO...`)

Se detectado, usar o fluxo de extração de relatório ao invés do page-by-page.

### 2. Extração de relatório (`extractAnnualReport`)

Nova função que recebe `pagesItems: TextItem[][]` e retorna `Pattern1aResult`:

```text
Para cada bloco de cabeçalho encontrado:
  1. Extrair header/employee/bank da página do cabeçalho (reusa extractHeader, extractEmployee, extractBankInfo)
  2. Concatenar TODOS os items de todas as páginas deste bloco
  3. Agrupar em linhas (groupIntoLines)
  4. Detectar header da tabela de eventos (colunas: Mês/Ano, Evento/Código, Discriminação/Descrição, Ref/Quantidade, Proventos/Valor, Descontos)
  5. Para cada linha de evento:
     a. Extrair o "Mês/Ano" (ex: "5/2022") 
     b. Extrair código, descrição, referência, valor(es)
     c. Agrupar por mês
  6. Deduplicação: para cada mês, quando o mesmo código+descrição aparece 2x:
     - 1ª ocorrência → vencimento
     - 2ª ocorrência → desconto
  7. Se a página 1 tem colunas separadas Proventos/Descontos, usar posição X para classificar
  8. Extrair footer (totals) da última página do bloco
  9. Gerar um ExtractedMonth por mês único encontrado, todos compartilhando os mesmos fields de cabeçalho
```

### 3. Lógica de deduplicação de eventos

```text
Para cada mês agrupado:
  eventMap = Map<"código|descrição", {count, provento, desconto, ref}>
  Para cada evento do mês:
    key = "código|descrição"
    Se key não existe: 1ª ocorrência → provento = valor
    Se key já existe: 2ª ocorrência → desconto = valor
```

### 4. Alterações em arquivos

**`src/lib/extraction-patterns/pattern1a.ts`**:
- Nova função `isAnnualReport(pagesItems)` - detecta se é relatório anual pela presença de coluna "Mês/Ano" na tabela de eventos
- Nova função `extractAnnualReport(pagesItems)` - lógica completa descrita acima
- Alterar `extractPattern1a` para chamar `extractAnnualReport` quando detectado

**`src/lib/extraction-patterns/detector.ts`**:
- Adicionar detecção de "Demonstrativo de Pagamento Mensal" + "Mês / Ano" como indicador de pattern 1a (caso não esteja sendo detectado)

### 5. Tratamento de páginas de continuação

Páginas 2+ que iniciam com `Fls.:` seguido diretamente de dados da tabela (sem cabeçalho) são continuações. A lógica deve:
- Detectar que não há cabeçalho novo → continuar acumulando eventos do bloco atual
- Quando encontrar novo "Demonstrativo de Pagamento Mensal" → iniciar novo bloco anual (ex: 2022 → 2023)

