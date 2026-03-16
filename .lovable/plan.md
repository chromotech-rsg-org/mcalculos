

## Correcao da Extracao de Holerites Keypar (PDF 2) - IMPLEMENTADO

### Mudancas Implementadas

1. **isDescontoByCode** - Heurística de classificação vencimento/desconto por código (2xxx = desconto, "Desc"/"INSS"/"IRRF" na descrição = desconto)
2. **Parser B reescrito** - parseEventLineByTextFallback agora usa isDescontoByCode para 1/2/3 valores
3. **Parser A fortalecido** - Quando vencX e descX < 80px, usa heurística por código em vez de posição
4. **Extração de empresa Keypar** - Reconhece "7 - COMERCIAL KEYPAR", label EMPRESA separado, LOCAL
5. **MÊS/ANO multi-linha** - Busca até 8 linhas à frente, evita capturar data do protocolo judicial
6. **Rodapé Keypar** - Cada label individual agora tenta next-line fallback para valor
7. **CADASTRO/NOME** - Detecta formato Keypar com código + nome + data admissão em linha separada
8. **CARGO/CBO** - Detecta labels CARGO + CBO com valores na linha seguinte
9. **Stop markers** - Adicionados "Assinado eletronicamente", "Fls.:", skip "Parabéns"

## Relatório Anual PLANOVA - IMPLEMENTADO

### Mudancas Implementadas

1. **isAnnualReport()** - Detecta relatórios anuais pela presença de "Mês / Ano" + "Evento/Código" no header da tabela
2. **extractAnnualReport()** - Nova função que processa todas as páginas como um bloco único
3. **Suporte a 3 formatos de evento**:
   - Formato A (pág 1): Colunas separadas Proventos/Descontos com Mês/Ano prefix
   - Formato B (pág 2-3): Coluna única "Valor" com Mês/Ano prefix, eventos duplicados
   - Formato C (pág 4+): Sem coluna Mês/Ano, mês como heading standalone
4. **Deduplicação** - Mesmo código+descrição aparece 2x por mês: 1ª = vencimento, 2ª = desconto
5. **Agrupamento por mês** - Gera um ExtractedMonth por mês único encontrado
6. **Header compartilhado** - Dados do funcionário (pág 1) replicados em todos os meses
7. **Footer na última página** - Totais gerais adicionados ao último mês
