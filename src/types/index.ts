export type UserRole = 'admin' | 'user';

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  cpf: string;
  cep: string;
  address: string;
  number: string;
  complement: string;
  city: string;
  state: string;
  notes: string;
  role: UserRole;
  createdAt: string;
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

export interface ExtractedMonth {
  month: string;
  fields: ExtractedField[];
}

export interface ExtractedData {
  employeeName: string;
  cnpj: string;
  documentType: 'holerite_normal' | 'relatorio_anual' | 'relatorio_imagem' | 'holerite_imagem' | 'termo_rescisao';
  payslipPattern?: string;
  months: ExtractedMonth[];
  extractedAt: string;
}

export interface Document {
  id: string;
  userId: string;
  name: string;
  description: string;
  payslipPattern?: string;
  files: DocumentFile[];
  extractedData: ExtractedData | null;
  status: 'pending' | 'extracting' | 'extracted' | 'error';
  createdAt: string;
  updatedAt: string;
}

export interface AuthState {
  isLoggedIn: boolean;
  currentUser: User | null;
}
