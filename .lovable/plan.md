

## Diagnóstico e Correção da Extração do PDF MENTOR (ISIDRO GARCIA FILHO)

### Problema Identificado

O PDF tem 9 páginas, cada uma é um holerite independente ("Demonstrativo de Pagamento Mensal") com meses de 04/2024 a 12/2024. O Excel exportado mostra que **todos os meses estão com os mesmos valores de footer** (Base FGTS=381,60, FGTS do Mês=30,53, Base IRRF=328,18) — que são os valores da **última página** (12/2024, rescisão). Isso indica que os totais e bases por página não estão sendo capturados corretamente.

### Causa Raiz

O footer do formato MENTOR tem uma particularidade: em várias páginas, os **labels e valores estão mesclados no mesmo bloco de texto** (ex: "Base para FGTS 318,00" como itens na mesma coordenada Y). O extrator de footer (`extractFooter`) e o scanner genérico (`extractAllFields`) podem:

1. **Não capturar os totals per-page** quando o formato mescla label+valor na mesma célula
2. **Os campos de footer na lista `fields[]` ficam duplicados** — cada campo usa `addIfNew` que rejeita duplicatas por key, fazendo com que o primeiro valor capturado prevaleça, mas como `extractAllFields` pode capturar valores incorretos primeiro, os corretos do `extractFooter` são ignorados

### Plano de Implementação

#### Passo 1: Diagnóstico via execução real
- Copiar o PDF para o sandbox
- Executar um script de diagnóstico que carregue o PDF via pdf.js, processe cada página com `extractPattern1aPage`, e imprima os campos de footer (Base FGTS, Total Vencimentos, Total Descontos, Valor Líquido) por página
- Comparar com os valores corretos do PDF para identificar onde a captura falha

#### Passo 2: Corrigir extração de footer para formato MENTOR
- Ajustar `extractFooter` para tratar o caso onde labels e valores estão na mesma linha (mesma Y) como itens separados — formato "Base para FGTS" + "318,00" na mesma linha
- Garantir que `extractEvents` captura os totals quando aparecem nas linhas de footer (Total de Proventos, Total de Desconto) antes do `break` por "Base para FGTS"
- Reordenar a prioridade em `extractPattern1aPage`: footer totals devem vir do `extractFooter` e `extractEvents`, não do scanner genérico

#### Passo 3: Garantir que dados de footer são ÚNICOS por página
- Verificar que `addIfNew` em `extractPattern1aPage` não está rejeitando valores corretos de footer porque `extractAllFields` já capturou valores incorretos
- Se necessário, fazer o footer sobrescrever os valores genéricos em vez de ser filtrado por duplicidade

#### Passo 4: Validar contra o PDF completo
- Reextrair o PDF e verificar que cada mês tem seus próprios valores corretos de:
  - Total de Proventos
  - Total de Descontos
  - Valor Líquido
  - Base FGTS, FGTS do Mês, Base IRRF
- Verificar que os eventos (rubricas) estão corretos por mês

### Dados Esperados por Página (referência)

| Página | Mês     | Total Proventos | Total Descontos | Líquido  |
|--------|---------|-----------------|-----------------|----------|
| 1      | 04/2024 | 1.135,08        | 435,57          | 699,51   |
| 2      | 05/2024 | 318,00          | 23,85           | 294,15   |
| 3      | 06/2024 | 318,00          | 23,85           | 294,15   |
| 4      | 07/2024 | 318,00          | 23,85           | 294,15   |
| 5      | 08/2024 | 318,00          | 23,85           | 294,15   |
| 6      | 09/2024 | 1.272,00        | 108,12          | 1.163,88 |
| 7      | 10/2024 | 1.272,00        | 374,77          | 897,23   |
| 8      | 11/2024 | 1.749,00        | 108,12          | 1.640,88 |
| 9      | 12/2024 | 3.879,60        | 3.879,60        | 0,00     |

