

## Plano de Implementação — 6 Correções e Melhorias

O usuário reportou 6 problemas distintos. Segue o plano para resolver cada um.

---

### 1. Ordenar rubricas em ordem alfabética no modal de extração

**Problema**: As rubricas (eventos) no modal de validação (`ValidationView`) aparecem na ordem em que foram extraídas, não em ordem alfabética.

**Solução**: Ordenar os arrays `vencimentoEvents`, `descontoEvents` e `quantidadeEvents` no componente `EventsTabView` por `descricao` usando `.sort()` com `localeCompare('pt-BR')`.

**Arquivo**: `src/components/documents/ValidationView.tsx` — nos `useMemo` das linhas 172-174.

---

### 2. Alterar cor do cabeçalho e rodapé para vermelho no modal de extração

**Problema**: Os campos de cabeçalho/rodapé não se distinguem visualmente dos campos de eventos.

**Solução**: No `DocumentDetail.tsx`, na seção "Dados Extraídos" (detalhado), aplicar fundo/borda vermelha nos campos de cabeçalho (primeiros campos como Empresa, CNPJ, Nome, Competência) e rodapé (Salário Base, Base FGTS, Total Vencimentos, Valor Líquido, etc.). Criar listas de regex para identificar campos de cabeçalho e rodapé e aplicar classes CSS distintas (ex: `bg-red-50 border-red-200` / `text-red-700`).

**Arquivo**: `src/pages/DocumentDetail.tsx` — na renderização dos `month.fields` (linhas 534-544).

---

### 3. Garantir que CSV e Excel tenham as mesmas colunas e dados

**Problema**: O CSV está vindo com dados diferentes do Excel na exportação.

**Solução**: O problema está em `exportToCSV` — quando usa o modo com tabs, ele recebe os mesmos `filteredData.tabs` do `ExportColumnSelector`, então as colunas devem ser idênticas. O bug provável é que o CSV usa `tabData.columns` diretamente sem filtrar por `selectedColumns`, enquanto o Excel filtra. Vou auditar e alinhar ambos os caminhos em `src/lib/export.ts` para que ambos usem exatamente os mesmos headers filtrados do `ExportColumnSelector`.

**Arquivo**: `src/lib/export.ts` e `src/components/documents/ExportColumnSelector.tsx`.

---

### 4. Criar menu lateral para gerenciar modelos salvos de holerites

**Problema**: Não há um menu dedicado para visualizar, editar e excluir modelos/templates salvos.

**Solução**:
- Criar nova página `src/pages/Templates.tsx` com listagem dos modelos, opção de renomear e excluir.
- Adicionar rota `/templates` em `App.tsx`.
- Adicionar item "Modelos" no `Sidebar.tsx` com ícone apropriado.

**Arquivos**: `src/pages/Templates.tsx` (novo), `src/App.tsx`, `src/components/layout/Sidebar.tsx`.

---

### 5. Ajustar sistema de modelos para funcionar independentemente

**Problema**: Ao criar um novo modelo, ele sobrescreve o anterior. Cada modelo deveria ser independente: uploads salvos mantêm a regra atual, e é possível trocar o modelo manualmente e re-extrair.

**Solução**:
- Garantir que `saveTemplate` sempre cria um novo registro (com novo ID) em vez de sobrescrever. Atualmente usa `upsert` com `onConflict: 'id'` — o problema é que o ID está sendo reutilizado.
- No `DocumentDetail`, adicionar um seletor de "Modelo de Validação" (dropdown com templates salvos) que, ao ser trocado, aplica o template e re-extrai/revalida os dados.
- Salvar o `template_id` no documento para rastrear qual modelo está aplicado.
- Ao re-extrair, aplicar automaticamente o template vinculado ao documento.

**Arquivos**: `src/pages/DocumentDetail.tsx`, `src/components/documents/ValidationView.tsx`, `src/lib/supabase-storage.ts`.

---

### 6. Corrigir rodapé repetido e competência ausente (HOLERITES MENTOR 544-552)

**Problema**: O sistema repete os dados do rodapé do último holerite (12/2024) para todos os meses, e a competência (mês/ano) não aparece na extração nem na exportação.

**Solução**: O `extractPattern1aPage` extrai header/footer/bank usando `extractFooter(lines)` que varre TODAS as linhas da página. Como cada página tem UM holerite, isso deveria funcionar. O problema provável é que no PDF "MENTOR 544-552" existem MÚLTIPLOS holerites na mesma página, e o `extractPattern1a` processa cada página como um único holerite — pegando o rodapé do último.

A correção envolve:
- No `extractPattern1aPage`, detectar múltiplos holerites por página (buscar repetições de padrões de cabeçalho como "Empresa", "CNPJ", "Competência" que indicam início de novo holerite).
- Dividir os `lines` em segmentos e processar cada segmento como um holerite separado.
- Para a competência: garantir que o campo `competencia` extraído do header é incluído nos `fields[]` e é exportado como coluna "Mês" ou "Competência" na planilha.

**Arquivo**: `src/lib/extraction-patterns/pattern1a.ts` — adicionar lógica de split por holerite dentro da mesma página.

---

### Resumo de Arquivos Alterados

| # | Tarefa | Arquivos |
|---|--------|----------|
| 1 | Ordem alfabética | `ValidationView.tsx` |
| 2 | Cor vermelha cabeçalho/rodapé | `DocumentDetail.tsx` |
| 3 | Paridade CSV/Excel | `export.ts`, `ExportColumnSelector.tsx` |
| 4 | Menu de modelos | `Templates.tsx` (novo), `App.tsx`, `Sidebar.tsx` |
| 5 | Modelos independentes | `DocumentDetail.tsx`, `ValidationView.tsx`, `supabase-storage.ts` |
| 6 | Rodapé repetido + competência | `pattern1a.ts` |

