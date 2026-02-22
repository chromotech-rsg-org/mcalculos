

# Sistema de Validacao e Aprendizado de Extracao

## Objetivo

Criar um sistema onde o usuario pode:
- Revisar cada campo extraido lado a lado com o PDF
- Corrigir titulos errados (ex: o sistema extraiu "Empresa" mas o valor e do "Nome")
- Renomear campos para padronizar
- Marcar campos como "ignorar" para futuras extracoes
- Salvar essas regras como um "modelo aprendido" que pode ser nomeado e reutilizado

## Como funciona

Apos a extracao, aparece uma nova aba "Validar" na tela de detalhes do documento. Nessa aba, cada campo extraido e mostrado com opcoes de acao rapida. O usuario valida, corrige ou ignora. Quando terminar, salva como modelo nomeado (ex: "Modelo Centro de Ensino", "Modelo A.L. IND COM"). Na proxima extracao, o sistema aplica as regras do modelo salvo automaticamente.

---

## Mudancas Tecnicas

### 1. Novos tipos em `src/types/index.ts`

Adicionar interfaces para o sistema de mapeamento/aprendizado:

```
FieldMapping {
  originalKey: string    // Titulo original extraido do PDF
  mappedKey: string      // Titulo corrigido/padronizado pelo usuario
  ignore: boolean        // Se true, nao mostra nas proximas extracoes
  validated: boolean     // Se o usuario ja validou este campo
}

ExtractionTemplate {
  id: string
  name: string           // Nome dado pelo usuario (ex: "Modelo Keypar")
  fieldMappings: FieldMapping[]
  createdAt: string
  updatedAt: string
}
```

Adicionar campo opcional `validationStatus` em `ExtractedMonth`:
```
validationStatus?: 'pending' | 'validated' | 'partial'
```

Adicionar campo opcional `templateId` em `Document` para vincular o documento a um modelo.

### 2. Storage para templates em `src/lib/storage.ts`

Adicionar funcoes CRUD para templates no localStorage:
- `getTemplates(): ExtractionTemplate[]`
- `saveTemplate(template): void`
- `deleteTemplate(id): void`
- `getTemplateById(id): ExtractionTemplate | undefined`

Chave: `mcalculos_templates`

### 3. Nova aba "Validar" em `src/pages/DocumentDetail.tsx`

Adicionar terceira aba alem de "Detalhado" e "Lista":

**Aba "Validar"** mostra:
- Cada campo extraido em formato de card com:
  - Titulo original (editavel - campo de texto)
  - Valor extraido (somente leitura)
  - Botao "OK" (marca como validado - fica verde)
  - Botao "Ignorar" (marca para ignorar nas proximas - fica cinza/riscado)
  - Status visual: pendente (amarelo), validado (verde), ignorado (cinza)

- No topo: barra de progresso de validacao (X de Y campos validados)
- Botao "Salvar como Modelo" que abre dialog para nomear o modelo
- Select para escolher um modelo existente e aplicar os mapeamentos

### 4. Novo componente `src/components/documents/ValidationView.tsx`

Componente dedicado para a validacao:
- Recebe `extractedData`, `onUpdate` callback
- Renderiza grade de cards para cada campo unico (agrupa por key)
- Permite editar o titulo (key) de cada campo
- Permite marcar como ignorado
- Permite marcar como validado
- Botao para salvar modelo
- Botao para aplicar modelo existente

### 5. Aplicar template na extracao em `src/lib/extraction-patterns/pattern1a.ts`

Adicionar funcao `applyTemplate(months, template)`:
- Percorre todos os `fields[]` de todos os meses
- Para cada field, busca no template se existe um `FieldMapping` com `originalKey` igual
- Se existir e `ignore === true`, remove o campo
- Se existir e `mappedKey` diferente do original, renomeia o campo
- Retorna os meses com campos ajustados

Essa funcao e chamada apos a extracao, se o documento tem um `templateId` vinculado.

### 6. Integrar no fluxo de extracao em `src/pages/DocumentDetail.tsx`

Apos extracao bem-sucedida:
- Se o documento tem `templateId`, aplica o template automaticamente
- Mostra badge indicando "Modelo aplicado: [nome]"
- Permite trocar ou desvincular modelo

---

## Arquivos a modificar

| Arquivo | Mudanca |
|---|---|
| `src/types/index.ts` | Adicionar `FieldMapping`, `ExtractionTemplate`, `validationStatus` |
| `src/lib/storage.ts` | CRUD de templates no localStorage |
| `src/components/documents/ValidationView.tsx` | **NOVO** - Componente de validacao |
| `src/pages/DocumentDetail.tsx` | Nova aba "Validar", integracao com templates |
| `src/lib/extraction-patterns/pattern1a.ts` | Funcao `applyTemplate()` |

## Fluxo do usuario

1. Faz upload do PDF e extrai
2. Abre aba "Validar"
3. Ve todos os campos com titulo e valor
4. Corrige titulos errados clicando no nome do campo
5. Marca campos irrelevantes como "Ignorar"
6. Clica "Salvar como Modelo" e da um nome (ex: "Centro de Ensino")
7. No proximo documento similar, seleciona o modelo salvo
8. O sistema aplica as correcoes automaticamente

