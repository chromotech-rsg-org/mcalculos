import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, UserRole } from '@/types';
import { supabase } from '@/integrations/supabase/client';

interface AuthContextType {
  isLoggedIn: boolean;
  currentUser: User | null;
  login: (email: string, password: string) => Promise<{ success: boolean; message: string }>;
  register: (userData: { name: string; email: string; password: string }) => Promise<{ success: boolean; message: string }>;
  logout: () => Promise<void>;
  updateUser: (userData: Partial<User>) => Promise<void>;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchUserProfile = async (userId: string, email: string): Promise<User | null> => {
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      const { data: roles } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId);

      const role: UserRole = roles?.some(r => r.role === 'admin') ? 'admin' : 'user';

      return {
        id: profile?.id || userId,
        user_id: userId,
        name: profile?.name || '',
        email,
        role,
        created_at: profile?.created_at || new Date().toISOString(),
      };
    } catch (error) {
      console.error('Error fetching user profile:', error);
      return null;
    }
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (session?.user) {
          const user = await fetchUserProfile(session.user.id, session.user.email || '');
          setCurrentUser(user);
        } else {
          setCurrentUser(null);
        }
        setIsLoading(false);
      }
    );

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        const user = await fetchUserProfile(session.user.id, session.user.email || '');
        setCurrentUser(user);
      }
      setIsLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const login = async (email: string, password: string): Promise<{ success: boolean; message: string }> => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      return { success: false, message: error.message === 'Invalid login credentials' ? 'Email ou senha incorretos.' : error.message };
    }
    return { success: true, message: 'Login realizado com sucesso!' };
  };

  const register = async (userData: { name: string; email: string; password: string }): Promise<{ success: boolean; message: string }> => {
    const { error } = await supabase.auth.signUp({
      email: userData.email,
      password: userData.password,
      options: {
        data: { name: userData.name },
        emailRedirectTo: window.location.origin,
      },
    });

    if (error) {
      if (error.message.includes('already registered')) {
        return { success: false, message: 'Este email já está cadastrado.' };
      }
      return { success: false, message: error.message };
    }
    return { success: true, message: 'Cadastro realizado com sucesso!' };
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setCurrentUser(null);
  };

  const updateUser = async (userData: Partial<User>) => {
    if (!currentUser) return;
    
    const { error } = await supabase
      .from('profiles')
      .update({ name: userData.name })
      .eq('user_id', currentUser.user_id);

    if (!error && userData.name) {
      setCurrentUser(prev => prev ? { ...prev, name: userData.name! } : null);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        isLoggedIn: !!currentUser,
        currentUser,
        login,
        register,
        logout,
        updateUser,
        isLoading,
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
