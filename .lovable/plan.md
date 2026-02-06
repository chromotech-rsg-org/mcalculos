

# M Cálculos Digitais - Sistema de Gestão de Holerites

## Visão Geral
Aplicação web frontend completa para gerenciamento de holerites e documentos trabalhistas, com foco em upload, extração inteligente de dados de diferentes formatos de PDF e exportação para Excel/CSV. Utiliza o logotipo oficial da M Cálculos Judiciais.

---

## Módulos do Sistema

### 1. 🔐 Autenticação Simulada
- **Tela de Login** com campos de email e senha
- **Tela de Cadastro** completo:
  - Nome, Email, Celular
  - CPF (com máscara e validação)
  - CEP (integração ViaCEP para auto-preenchimento de endereço)
  - Logradouro, Número, Complemento, Cidade, Estado
  - Campo de observações
- **Recuperação de senha** (mockada)
- **Persistência no localStorage** para simular sessão

### 2. 📊 Dashboard Central
- **Header** com logotipo M Cálculos e navegação
- **Card principal** com drag-and-drop para upload de PDFs/imagens
- **Lista de documentos recentes** com preview e status de extração
- **Estatísticas rápidas**: total de documentos, extrações pendentes
- **Design moderno** com gradientes (verde-esmeralda para azul)

### 3. 📁 Upload de Documentos
- **Upload múltiplo** (PDFs e imagens)
- **Campos obrigatórios**: Nome único (validação), Descrição
- **Detecção de duplicados**: Modal para agrupar ao existente ou criar novo
- **Conversão para base64** para persistência no localStorage
- **Indicador de progresso** durante upload
- **Preview instantâneo** do arquivo carregado

### 4. 🔍 Extração Inteligente de Dados
- **pdf.js** para PDFs com texto selecionável
- **Tesseract.js** para OCR em PDFs escaneados/imagens
- **Reconhecimento de padrões** para 5 tipos de documentos:
  1. Holerite Normal (1 página)
  2. Relatório Anual (multi-mês)
  3. Relatório Anual em Imagem
  4. Holerite digitalizado (imagem)
  5. Termo de Rescisão
- **Extração de campos-chave**: 
  - Nome funcionário, CNPJ, Data
  - Vencimentos e Descontos (todas as rubricas)
  - Base INSS, FGTS, IRRF
  - Valor Líquido
- **Organização tabular** por mês/período

### 5. ✏️ Visualização e Edição
- **Preview do PDF** embarcado na tela
- **Tabela de dados extraídos** totalmente editável
- **Ações por linha**: editar, excluir, destacar
- **Validação de campos** numéricos
- **Auto-save** das alterações no localStorage

### 6. 📤 Exportação de Dados
- **Seleção de campos** via checkboxes
- **Formatos disponíveis**: Excel (.xlsx) e CSV
- **Download automático** via SheetJS
- **Prévia antes de exportar**

### 7. 📂 Meus Documentos
- **Lista completa** de todos os documentos do usuário
- **Filtros e busca** por nome, data, tipo
- **Ações em lote**: selecionar múltiplos, exportar, excluir
- **Visualização rápida** com modal de preview
- **Download do PDF original**

---

## Design & UX
- **Identidade visual** baseada no logo M Cálculos (azul/vermelho)
- **Gradientes modernos** (emerald-500 → blue-600) em botões e headers
- **Bordas arredondadas** (rounded-xl) e sombras sutis
- **Layout responsivo** (mobile-first)
- **Sidebar fixa**: Dashboard, Meus Documentos, Perfil, Logout
- **Loaders animados** e feedback visual em todas as ações
- **Modais elegantes** para confirmações e formulários

---

## Tecnologias
- **React + TypeScript + Vite** (base Lovable)
- **Tailwind CSS** para styling moderno
- **localStorage** para persistência (sem backend)
- **pdf.js** para leitura de PDFs
- **Tesseract.js** para OCR em imagens
- **SheetJS** para exportação Excel/CSV
- **ViaCEP API** para busca de endereço

