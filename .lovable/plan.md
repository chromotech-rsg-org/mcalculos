

## Correcao da Extracao de Holerites Keypar (PDF 2)

### Problema Identificado

O PDF da Keypar ("Demonstrativo de Pagamento de Salario") tem um layout onde o pdf.js entrega text items com colunas mescladas ou desalinhadas. A saida do parser mostra valores como "9,131.531,00" (concatenacao errada de referencia + vencimento) e uma coluna fantasma "TOS" (fragmento de "DESCONTOS"). O Parser A (posicional) falha porque as coordenadas X das colunas estao incorretas, e o Parser B (textual) nao consegue distinguir vencimento de desconto quando ha 2 valores numericos.

O PDF da A.L. IND COM funciona porque seus text items sao bem separados por coluna.

### Mudancas Planejadas

**1. Heuristica de classificacao vencimento/desconto por codigo (pattern1a.ts)**

Quando o parser posicional falha ou as coordenadas X sao ambiguas, usar o codigo do evento para classificar:
- Codigos 2xxx (INSS, IRRF, contribuicoes, descontos) = DESCONTO
- Codigos que contem "Desc" na descricao = DESCONTO
- Demais codigos = VENCIMENTO

Isso sera aplicado tanto no Parser A quanto no Parser B como heuristica de desempate.

**2. Melhorar Parser B (texto fallback) para Keypar**

Reformular `parseEventLineByTextFallback` para lidar com as variantes:
- 1 valor: classificar por codigo (2xxx = desconto, outros = vencimento)
- 2 valores: primeiro e referencia, segundo e venc/desc conforme codigo
- 3 valores: referencia + vencimento + desconto

Tratar tambem linhas com descricao contendo parenteses, barras e acentos (ex: "Horas Extras c/ 100%", "Desc.Adto Salarial", "1/3 Ferias").

**3. Fortalecer Parser A para colunas proximas**

No `parseEventLineByItems`, quando vencX e descX estao muito proximos (< 80px de distancia), ativar a heuristica por codigo em vez de confiar na posicao X. Tambem tratar o caso em que o texto "DESCONTOS" aparece fragmentado ("TOS" + "DESCON") em items separados.

**4. Melhorar extracao de empresa Keypar**

Na funcao `extractHeader`, adicionar reconhecimento do formato "7 - COMERCIAL KEYPAR REPRES E SUPERM LTDA" (numero + hifen + nome) e do label "LOCAL" seguido do valor (ex: "LJ UBA1 -FISCAL DE LOJA JUNIOR").

**5. Garantir MES/ANO correto por pagina**

O formato Keypar tem o mes (ex: "03") e o ano (ex: "/ 2019") em linhas separadas, as vezes com "05 / 2023 MES/ANO" na primeira linha (que e a data do documento judicial, nao a competencia do holerite). Ajustar para:
- Priorizar o mes/ano que aparece PROXIMO da tabela de eventos (nao no cabecalho do documento judicial)
- Quando houver conflito entre "05/2023" (cabecalho) e "03/2019" (competencia), usar o que esta mais proximo dos dados do funcionario

**6. Extracao de campos do rodape Keypar**

Garantir que TOTAL DE VENCIMENTOS, TOTAL DE DESCONTOS, VALOR LIQUIDO, SALARIO BASE, BASE CALC. FGTS, FGTS DO MES, BASE CALCULO IRRF sejam capturados corretamente mesmo quando os labels e valores estao em linhas separadas no formato Keypar.

### Arquivos Modificados

- `src/lib/extraction-patterns/pattern1a.ts` - Todas as 6 mudancas acima
- `src/lib/extraction-patterns/detector.ts` - Melhorar deteccao do padrao Keypar como 1a

### Detalhes Tecnicos

A funcao `parseEventLineByTextFallback` sera reescrita para:

```text
Entrada: "001 Horas Normais 30,00 1.531,00"
Saida: { codigo: "001", descricao: "Horas Normais", referencia: "30,00", vencimento: "1.531,00", desconto: "0" }

Entrada: "2000 INSS 9,00 168,45"
Saida: { codigo: "2000", descricao: "INSS", referencia: "9,00", vencimento: "0", desconto: "168,45" }

Entrada: "2464 Desc.Adto Salarial 570,19"
Saida: { codigo: "2464", descricao: "Desc.Adto Salarial", referencia: "", vencimento: "0", desconto: "570,19" }
```

A heuristica de codigo sera uma funcao auxiliar:

```text
isDescontoByCode(codigo, descricao):
  - codigo comeca com "2" (2000-2999) = true
  - descricao contem "Desc" ou "Desconto" = true
  - descricao contem "INSS" ou "IRRF" e nao contem "Base" = true
  - caso contrario = false
```

Para o MES/ANO, a logica sera:
1. Buscar periodo na zona do cabecalho do funcionario (perto de "CADASTRO", "NOME", "DATA ADMISSAO")
2. Ignorar datas que estejam na primeira linha do documento (que podem ser do protocolo judicial)
3. Manter a varredura multi-linha existente como fallback

