

## Problema Identificado

Analisando o PDF e o Excel esperado, identifiquei os seguintes problemas na extração:

### 1. Classificação incorreta de VALE REFEIÇÃO - PAGAMENTO

A função `isDescontoByCode` classifica **todos** os eventos "VALE REFEICAO" como desconto, incluindo o "VALE REFEICAO ADMITIDOS MÊS - PAGAMENTO" (código 0741/1741), que na verdade é um **provento**. Apenas o "VALE REFEICAO ADMITIDOS MÊS - DESCONTO" (código 0742) é desconto.

A regra atual:
```
if (/\bVALE\s+(TRANSPORTE|REFEI)/i.test(normalized)) return true;
```
Não distingue entre a variante de pagamento e desconto. Quando a classificação posicional é ambígua (colunas Proventos/Descontos próximas), o heurístico classifica incorretamente o pagamento como desconto.

### 2. Competência do header conflitando com "Mês / Ano" da tabela

O `extractHeader` possui uma busca por "MÊS/ANO" que, ao encontrar a linha do cabeçalho da tabela de eventos, escaneia linhas próximas buscando dígitos soltos. Isso pode capturar valores incorretos como competência do header, conflitando com o período correto extraído dos eventos.

### 3. Footer com labels e valores na mesma célula

Neste PDF, o rodapé tem formato onde label e valor estão juntos (ex: "Base para FGTS 318,00" na mesma linha). O extrator de footer já suporta vários formatos mas precisa ser verificado para este padrão específico.

---

## Plano de Implementação

### Passo 1: Corrigir `isDescontoByCode` em `pattern1a.ts`
- Adicionar exceção: se a descrição contém "PAGAMENTO" e **não** contém "DESCONTO", NÃO classificar como desconto para VALE TRANSPORTE/REFEIÇÃO
- Regra corrigida: só classificar VALE como desconto se a descrição contiver "DESC" ou não contiver "PAGAMENTO"

### Passo 2: Refinar detecção de período no header
- Na seção `MÊS/ANO` do `extractHeader`, evitar que a linha do cabeçalho da tabela de eventos ("Mês / Ano Evento Discriminação...") dispare a busca por competência, pois isso pode capturar o mês de uma linha de evento como competência global

### Passo 3: Adicionar teste para este formato
- Criar teste unitário que valide a extração correta do PDF "Demonstrativo de Pagamento Mensal" com coluna "Mês / Ano", garantindo:
  - VALE REFEICAO PAGAMENTO → provento
  - VALE REFEICAO DESCONTO → desconto
  - Período correto por página (04/2024, 05/2024, etc.)
  - Footer values (Base FGTS, Total Proventos, Líquido) capturados por página

