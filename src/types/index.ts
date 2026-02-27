export type UserRole = 'admin' | 'user';

export interface User {
  id: string;
  user_id: string;
  name: string;
  email: string;
  role: UserRole;
  created_at: string;
}

export interface DocumentFile {
  id: string;
  name: string;
  type: string;
  size: number;
  base64: string;
  uploadedAt: string;
}

export interface ExtractedField {
  key: string;
  value: string;
}

export interface PayslipEvent {
  codigo: string;
  descricao: string;
  referencia: string;
  vencimento: string;
  desconto: string;
}

export interface ExtractedMonth {
  month: string;
  fields: ExtractedField[];
  empresa?: string;
  cnpj?: string;
  centroCusto?: string;
  tipoFolha?: string;
  competencia?: string;
  folhaNumero?: string;
  codigoFuncionario?: string;
  nomeFuncionario?: string;
  cbo?: string;
  departamento?: string;
  filial?: string;
  cargo?: string;
  dataAdmissao?: string;
  endereco?: string;
  bairro?: string;
  cidade?: string;
  cep?: string;
  uf?: string;
  pis?: string;
  cpf?: string;
  identidade?: string;
  dataCredito?: string;
  depSalFam?: string;
  eventos?: PayslipEvent[];
  salarioBase?: string;
  totalVencimentos?: string;
  totalDescontos?: string;
  valorLiquido?: string;
  baseInss?: string;
  baseFgts?: string;
  fgtsMes?: string;
  baseIrrf?: string;
  irrf?: string;
  banco?: string;
  agencia?: string;
  contaCorrente?: string;
  validationStatus?: 'pending' | 'validated' | 'partial';
}

export interface ExtractedData {
  employeeName: string;
  cnpj: string;
  documentType: 'holerite_normal' | 'relatorio_anual' | 'relatorio_imagem' | 'holerite_imagem' | 'termo_rescisao';
  payslipPattern?: string;
  months: ExtractedMonth[];
  extractedAt: string;
}

export interface FieldMapping {
  originalKey: string;
  mappedKey: string;
  ignore: boolean;
  validated: boolean;
  parentKey?: string;
}

export interface ExtractionTemplate {
  id: string;
  name: string;
  field_mappings: FieldMapping[];
  created_at: string;
  updated_at: string;
}

export interface Document {
  id: string;
  user_id: string;
  name: string;
  description: string;
  payslip_pattern?: string;
  template_id?: string;
  files: DocumentFile[];
  extracted_data: ExtractedData | null;
  status: 'pending' | 'extracting' | 'extracted' | 'error';
  created_at: string;
  updated_at: string;
}

export interface AuthState {
  isLoggedIn: boolean;
  currentUser: User | null;
}
