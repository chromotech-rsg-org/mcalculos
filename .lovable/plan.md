

## Análise da Solicitação

O usuário quer reestruturar completamente a extração e visualização de dados dos holerites Pattern 1a:

### Situação Atual
- Dados organizados em linhas numeradas (linha 1, linha 2, etc.)
- Uma única visualização com todas as informações

### Novo Requisito
1. **Reorganização por Descrição**: Usar a descrição como nome da coluna
2. **Triplicação em 3 Abas**:
   - Aba "Vencimentos": valores da coluna vencimento  
   - Aba "Descontos": valores da coluna desconto
   - Aba "QTDE": valores da coluna quantidade
3. **Seleção de Abas**: Opção para extrair todas as 3 abas ou apenas algumas
4. **Colunas Dinâmicas**: Só criar coluna se houver valor

## Plano de Implementação

### Etapa 1: Análise do Código Atual
- Examinar `src/lib/extraction-patterns/pattern1a.ts` para entender estrutura atual
- Analisar `src/components/documents/DataTableView.tsx` para ver como dados são exibidos
- Verificar `src/types/index.ts` para estruturas de dados

### Etapa 2: Reestruturação dos Tipos
- Modificar tipos em `src/types/index.ts` para suportar 3 abas
- Adicionar campo para indicar quais abas extrair
- Criar estrutura para dados organizados por descrição

### Etapa 3: Modificação da Extração Pattern1a
- Alterar `extractPattern1a` para:
  - Organizar dados por descrição ao invés de linhas numeradas
  - Gerar 3 estruturas separadas (vencimentos, descontos, qtde)
  - Só incluir colunas com valores
  - Preservar dados de cabeçalho/rodapé em todas as abas

### Etapa 4: Interface de Seleção
- Adicionar opções no upload/extração para escolher quais abas gerar
- Checkboxes ou radio buttons para "Vencimentos", "Descontos", "QTDE"

### Etapa 5: Visualização com Abas
- Modificar `DataTableView.tsx` para suportar múltiplas abas
- Implementar componente de tabs usando `@radix-ui/react-tabs`
- Cada aba mostra dados específicos (vencimentos/descontos/qtde)
- Manter dados de cabeçalho/rodapé em todas

### Etapa 6: Ajustes na Exportação
- Adaptar sistema de exportação para lidar com múltiplas abas
- Permitir exportação de aba específica ou todas

## Arquivos a Serem Modificados

### Core
- `src/types/index.ts` - Novos tipos para estrutura de 3 abas
- `src/lib/extraction-patterns/pattern1a.ts` - Lógica de reorganização por descrição

### UI Components  
- `src/components/documents/DataTableView.tsx` - Sistema de abas
- `src/components/documents/UploadModal.tsx` - Opções de seleção de abas
- `src/components/documents/ValidationView.tsx` - Adaptar para nova estrutura

### Pages
- `src/pages/DocumentDetail.tsx` - Integrar nova visualização com abas

## Exemplo da Nova Estrutura

```typescript
interface ExtractedDataWithTabs {
  // ... dados atuais do cabeçalho
  tabs: {
    vencimentos?: TabData;
    descontos?: TabData; 
    quantidade?: TabData;
  }
}

interface TabData {
  columns: string[]; // ["Salário Mensalistas", "Hora Extra", ...]
  rows: Record<string, any>[][]; // dados organizados por mês
}
```

## Considerações Técnicas

1. **Compatibilidade**: Manter suporte para documentos já extraídos
2. **Performance**: Evitar triplicação desnecessária de dados
3. **UX**: Interface clara para seleção de abas
4. **Exportação**: Adaptar Excel para múltiplas planilhas

