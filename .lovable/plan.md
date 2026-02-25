
Objetivo
Corrigir a extração da tabela de Eventos/Tabela no padrão 1a para funcionar de forma consistente em holerites com variações de layout (como os da imagem 2 vs imagem 3), garantindo que:
- a tabela seja extraída mesmo quando o PDF vem com texto “colado”/mesclado por linha;
- o mês/ano (ex.: “03 / 2019” em MÊS/ANO) continue correto por holerite;
- não dependa de um único formato de cabeçalho/colunas.

Diagnóstico do que está acontecendo hoje
1) A extração da tabela em `pattern1a.ts` está muito dependente de `TextItem` bem separado por coluna.
- Quando o PDF entrega uma linha mesclada (ex.: “001 Horas Normais 30,00 1.531,00”), o parser atual pode não achar `eventCodeItem` e descartar a linha.

2) O fallback atual para OCR acontece só quando praticamente nada foi extraído.
- Em `extractDataFromPDF`, se vieram campos do cabeçalho/rodapé, mas a tabela falhou, não entra no fallback OCR para completar apenas eventos.

3) Extração por imagem (`extractDataFromImage`) ainda não estrutura `eventos`.
- Hoje OCR extrai campos simples; não monta `eventos[]`, então o Validar/Tabela pode ficar vazio nesse cenário.

4) A lógica de validação de eventos usa uma lista “única” global e pode mascarar diferenças por holerite.
- Isso não é a causa raiz da falha de extração, mas pode confundir resultado final quando há meses diferentes.

Abordagem de implementação
Vou implementar uma estratégia híbrida de extração da tabela no padrão 1a:
- Parser A (posicional, atual) continua sendo o principal.
- Parser B (textual por linha) entra como fallback por linha quando o A falhar.
- Fallback OCR parcial para eventos entra quando a tabela do PDF vier vazia/incompleta.
- Normalização de cabeçalho de tabela e de MÊS/ANO para variações com espaços, acentos e abreviações.

Plano técnico por etapas

1) Fortalecer detecção do bloco da tabela (pattern1a)
Arquivo: `src/lib/extraction-patterns/pattern1a.ts`
- Refatorar `extractEvents` para separar em funções menores:
  - `detectEventHeader(...)`
  - `parseEventLineByItems(...)`
  - `parseEventLineByTextFallback(...)`
- Ampliar reconhecimento de cabeçalhos:
  - CÓD./COD/CÓDIGO
  - DESCRIÇÃO/DISCRIMINAÇÃO
  - REFERÊNCIA/REF
  - VENCIMENTOS/PROVENTOS
  - DESCONTOS
- Melhorar regra de fim de tabela com marcadores de rodapé mais robustos (Salário Base, Base FGTS, Valor Líquido, etc.), sem cortar linhas válidas.

2) Adicionar fallback textual por linha para eventos
Arquivo: `src/lib/extraction-patterns/pattern1a.ts`
- Quando parsing por itens falhar, aplicar parsing por texto:
  - detectar código no início (`^\d{3,4}`)
  - extrair números monetários da direita para a esquerda
  - inferir referência/vencimento/desconto por ordem e/ou proximidade de colunas quando disponível
- Tratar casos comuns do layout Semar/Keypar:
  - códigos com zeros à esquerda (001)
  - descrição com acento e abreviações
  - linha com 2 ou 3 números (sem desconto ou sem referência explícita).

3) Completar “MÊS/ANO” para formatos com espaços
Arquivo: `src/lib/extraction-patterns/pattern1a.ts`
- Reforçar captura de competência/período para:
  - `03/2019`
  - `03 / 2019`
  - ocorrência em linha “MÊS/ANO” mesmo sem label “Competência”.
- Garantir que cada holerite mantenha seu próprio período (sem replicação indevida).

4) Fallback OCR parcial para eventos quando PDF falhar nessa parte
Arquivo: `src/lib/extraction.ts` (e eventualmente helper em `pattern1a.ts`)
- Após `extractPattern1a(pageItems)`, detectar páginas/meses com:
  - campos ok, mas `eventos` vazio ou claramente insuficiente.
- Nesses casos, rodar OCR para complementar somente `eventos` (não sobrescrever campos bons do PDF).
- Unir resultado preservando totais e período por mês.

5) Ajuste de consistência na validação para não “achatar” valores de eventos entre holerites
Arquivo: `src/components/documents/ValidationView.tsx`
- Manter a aba Eventos/Tabela, mas evitar aplicar os mesmos valores monetários para todos os meses ao “Aplicar Alterações”.
- Preservar valores por holerite, aplicando em massa apenas ações de status/ignorar e, quando fizer sentido, renomeação de descrição.

6) Testes e validação
Arquivos: `src/test/...` (novos testes unitários focados em parser)
- Criar cenários sintéticos de linhas para:
  - layout imagem 2 (já funciona)
  - layout imagem 3 (falhava)
- Cobrir:
  - detecção de cabeçalho da tabela
  - parsing por itens
  - fallback textual
  - período `03 / 2019`
  - não duplicar/contaminar eventos entre meses.

Critérios de aceite
- Holerite estilo imagem 2: continua extraindo tabela completa em Eventos/Tabela.
- Holerite estilo imagem 3: passa a extrair tabela completa em Eventos/Tabela.
- Mês/ano (ex.: 03/2019) aparece corretamente por holerite.
- Em documentos com múltiplos holerites, cada mês mantém seus próprios valores de eventos.
- Aba Validar/Eventos continua com rolagem e usabilidade atual.

Riscos e mitigação
- Risco: parser textual capturar falso positivo fora da tabela.
  - Mitigação: só ativar fallback textual dentro do intervalo detectado da tabela e exigir padrão de código + valores monetários.
- Risco: OCR aumentar tempo de extração.
  - Mitigação: fallback OCR apenas quando necessário (eventos ausentes/incompletos), não como padrão.

Sequência de execução recomendada
1. Refatorar/detalhar `extractEvents` (detecção + parsing híbrido).
2. Ajustar captura de período MÊS/ANO.
3. Implementar fallback OCR parcial para eventos.
4. Ajustar aplicação de eventos na validação para respeitar variação por holerite.
5. Validar com os dois layouts (imagem 2 e imagem 3) e testes unitários.
