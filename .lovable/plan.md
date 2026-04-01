

## Problema

Na extração do holerite 277-305 (formato ADP/Indra com colunas CONTA / QTDE.v1 / VENCIMENTOS / DESCONTOS), os valores estão sendo atribuídos incorretamente aos campos internos do evento (`referencia`, `vencimento`, `desconto`). Como resultado, as 3 abas (Vencimentos, Descontos, QTDE) mostram os mesmos valores em vez de mostrar apenas o valor correspondente à sua coluna.

**Causa raiz**: O parser posicional (`parseEventLineByItems`) classifica valores numéricos pela posição X comparando com `vencX`, `descX` e `refX`. Porém, para o formato ADP/Indra, a detecção de `refX` busca "QTDE" no header, que retorna o **centro** do item de texto. Quando os valores monetários são classificados pelo **right edge**, a comparação de distâncias pode colocar o valor de QTDE na coluna errada (vencimento), e o valor de vencimento na coluna de QTDE.

## Plano de Ajuste

### 1. Corrigir classificação de valores no `parseEventLineByItems`

**Arquivo**: `src/lib/extraction-patterns/pattern1a.ts`

- No bloco de classificação por posição (linhas ~997-1044), garantir que os valores sejam atribuídos corretamente usando a mesma métrica (right edge) para todas as 3 colunas (refX, vencX, descX)
- Atualmente o `refX` é tratado separadamente (primeiro pass) e os restantes num segundo pass. O problema é que a comparação de distâncias pode falhar quando as colunas estão próximas
- **Ajuste**: Classificar TODOS os numeric items em um único pass usando a distância mínima entre right edge e os 3 column centers (refX, vencX, descX), atribuindo cada valor à coluna mais próxima

### 2. Garantir detecção correta do header "QTDE.v1"

**Arquivo**: `src/lib/extraction-patterns/pattern1a.ts`

- Na `detectEventHeader` (linha 851), o `findColumnX` já busca "QTDE" que funciona com "QTDE.v1" via `includes()`
- Verificar que o `findColumnX` retorna a posição correta do **centro** do item "QTDE.v1"

### 3. Ajustar findColumnX para usar right edge (consistência)

**Arquivo**: `src/lib/extraction-patterns/pdf-layout.ts`

- Opcionalmente, considerar retornar right edge em vez de center para headers monetários, já que os valores são right-aligned. Isso melhoraria a precisão da classificação.
- Alternativa mais segura: manter center no header mas usar center (não right edge) nos valores também, ou usar um threshold mais amplo

### Resumo das alterações

| Arquivo | Alteração |
|---------|-----------|
| `src/lib/extraction-patterns/pattern1a.ts` | Refatorar classificação de valores para usar 3-way comparison (ref vs venc vs desc) em um único pass |
| `src/lib/extraction-patterns/pdf-layout.ts` | Possível ajuste no `findColumnX` para consistência com right-aligned values |

