import { User, Document, AuthState } from '@/types';

const STORAGE_KEYS = {
  AUTH: 'mcalculos_auth',
  DOCUMENTS: 'mcalculos_documents',
  USERS: 'mcalculos_users',
};

// Auth Storage
export const getAuthState = (): AuthState => {
  const data = localStorage.getItem(STORAGE_KEYS.AUTH);
  return data ? JSON.parse(data) : { isLoggedIn: false, currentUser: null };
};

export const setAuthState = (state: AuthState): void => {
  localStorage.setItem(STORAGE_KEYS.AUTH, JSON.stringify(state));
};

export const clearAuth = (): void => {
  localStorage.removeItem(STORAGE_KEYS.AUTH);
};

// Users Storage
export const getUsers = (): User[] => {
  const data = localStorage.getItem(STORAGE_KEYS.USERS);
  return data ? JSON.parse(data) : [];
};

export const saveUser = (user: User): void => {
  const users = getUsers();
  const existingIndex = users.findIndex(u => u.email === user.email);
  if (existingIndex >= 0) {
    users[existingIndex] = user;
  } else {
    users.push(user);
  }
  localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
};

export const findUserByEmail = (email: string): User | undefined => {
  const users = getUsers();
  return users.find(u => u.email.toLowerCase() === email.toLowerCase());
};

// Default admin user
const DEFAULT_ADMIN: User = {
  id: 'admin-001',
  name: 'Administrador',
  email: 'admin@mcalculos.com',
  phone: '(11) 99999-9999',
  cpf: '000.000.000-00',
  cep: '01310-100',
  address: 'Avenida Paulista',
  number: '1000',
  complement: 'Sala 100',
  city: 'São Paulo',
  state: 'SP',
  notes: 'Usuário administrador do sistema',
  role: 'admin',
  createdAt: new Date().toISOString(),
};

// Delete user (admin only, cannot delete own account)
export const deleteUser = (userId: string): void => {
  const users = getUsers().filter(u => u.id !== userId);
  localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
};

// Get user by ID
export const getUserById = (userId: string): User | undefined => {
  return getUsers().find(u => u.id === userId);
};

// Initialize admin user if not exists
export const initializeDefaultUsers = (): void => {
  const users = getUsers();
  const adminExists = users.some(u => u.email === DEFAULT_ADMIN.email);
  if (!adminExists) {
    users.push(DEFAULT_ADMIN);
    localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
  }
};

// Documents Storage
export const getDocuments = (userId?: string): Document[] => {
  const data = localStorage.getItem(STORAGE_KEYS.DOCUMENTS);
  const docs: Document[] = data ? JSON.parse(data) : [];
  return userId ? docs.filter(d => d.userId === userId) : docs;
};

export const saveDocument = (doc: Document): void => {
  const docs = getDocuments();
  const existingIndex = docs.findIndex(d => d.id === doc.id);
  if (existingIndex >= 0) {
    docs[existingIndex] = { ...doc, updatedAt: new Date().toISOString() };
  } else {
    docs.push(doc);
  }
  localStorage.setItem(STORAGE_KEYS.DOCUMENTS, JSON.stringify(docs));
};

export const deleteDocument = (docId: string): void => {
  const docs = getDocuments().filter(d => d.id !== docId);
  localStorage.setItem(STORAGE_KEYS.DOCUMENTS, JSON.stringify(docs));
};

export const getDocumentById = (docId: string): Document | undefined => {
  return getDocuments().find(d => d.id === docId);
};

// Storage Size Check
export const getStorageUsage = (): { used: number; max: number; percentage: number } => {
  let total = 0;
  for (const key in localStorage) {
    if (localStorage.hasOwnProperty(key)) {
      total += localStorage.getItem(key)?.length || 0;
    }
  }
  const maxSize = 5 * 1024 * 1024; // ~5MB
  return {
    used: total,
    max: maxSize,
    percentage: (total / maxSize) * 100,
  };
};

// Generate unique ID
export const generateId = (): string => {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};
