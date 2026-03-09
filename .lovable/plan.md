

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
