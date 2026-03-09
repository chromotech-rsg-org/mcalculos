

## Problema

O `build-tabs.ts` usa uma lista fixa de 25 campos (`HEADER_FIELDS`) mapeados manualmente para propriedades do `ExtractedMonth`. Porém, a extração Pattern 1a captura dinamicamente TODOS os pares rótulo-valor do holerite no array `fields[]` (Endereço, Bairro, Cidade, UF, Matrícula, Local de Pagamento, Dep. IR, Dep. SF, etc.). Esses campos dinâmicos não aparecem nas abas nem no Excel.

## Solução

Modificar `src/lib/build-tabs.ts` para incluir **todos os campos dinâmicos de `fields[]`** em cada aba, além dos campos de evento por descrição.

### Alterações em `src/lib/build-tabs.ts`

1. Coletar todas as chaves únicas de `month.fields[]` de todos os meses (preservando ordem de aparição)
2. Incluir essas chaves como colunas antes das descrições de eventos
3. Preencher os valores a partir de `month.fields[]` para cada linha
4. Remover a lista `HEADER_FIELDS` fixa e o switch `getHeaderFieldValue` — usar diretamente os dados de `fields[]`

```text
Antes:  [HEADER_FIELDS fixos (25)] + [Descrições de eventos]
Depois: [Todos os fields[] dinâmicos] + [Descrições de eventos]
```

Isso garante que qualquer campo extraído do holerite (cabeçalho, rodapé, dados bancários, endereço) aparece automaticamente em todas as 3 abas e no Excel exportado, sem necessidade de manutenção manual da lista.

