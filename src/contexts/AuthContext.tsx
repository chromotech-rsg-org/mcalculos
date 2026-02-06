import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, AuthState } from '@/types';
import { getAuthState, setAuthState, clearAuth, findUserByEmail, saveUser, generateId } from '@/lib/storage';

interface AuthContextType {
  isLoggedIn: boolean;
  currentUser: User | null;
  login: (email: string, password: string) => { success: boolean; message: string };
  register: (userData: Omit<User, 'id' | 'createdAt'>) => { success: boolean; message: string };
  logout: () => void;
  updateUser: (userData: Partial<User>) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [authState, setAuthStateLocal] = useState<AuthState>({
    isLoggedIn: false,
    currentUser: null,
  });

  useEffect(() => {
    const savedState = getAuthState();
    setAuthStateLocal(savedState);
  }, []);

  const login = (email: string, _password: string): { success: boolean; message: string } => {
    const user = findUserByEmail(email);
    
    if (!user) {
      return { success: false, message: 'Usuário não encontrado. Cadastre-se primeiro.' };
    }
    
    // Simulated login - no real password check
    const newState: AuthState = { isLoggedIn: true, currentUser: user };
    setAuthState(newState);
    setAuthStateLocal(newState);
    
    return { success: true, message: 'Login realizado com sucesso!' };
  };

  const register = (userData: Omit<User, 'id' | 'createdAt'>): { success: boolean; message: string } => {
    const existingUser = findUserByEmail(userData.email);
    
    if (existingUser) {
      return { success: false, message: 'Este email já está cadastrado.' };
    }
    
    const newUser: User = {
      ...userData,
      id: generateId(),
      createdAt: new Date().toISOString(),
    };
    
    saveUser(newUser);
    
    const newState: AuthState = { isLoggedIn: true, currentUser: newUser };
    setAuthState(newState);
    setAuthStateLocal(newState);
    
    return { success: true, message: 'Cadastro realizado com sucesso!' };
  };

  const logout = () => {
    clearAuth();
    setAuthStateLocal({ isLoggedIn: false, currentUser: null });
  };

  const updateUser = (userData: Partial<User>) => {
    if (!authState.currentUser) return;
    
    const updatedUser: User = { ...authState.currentUser, ...userData };
    saveUser(updatedUser);
    
    const newState: AuthState = { isLoggedIn: true, currentUser: updatedUser };
    setAuthState(newState);
    setAuthStateLocal(newState);
  };

  return (
    <AuthContext.Provider
      value={{
        isLoggedIn: authState.isLoggedIn,
        currentUser: authState.currentUser,
        login,
        register,
        logout,
        updateUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
