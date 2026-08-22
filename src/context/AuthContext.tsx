import React, { createContext, useContext, useState, useEffect } from 'react';
import { fetchApi } from '../services/api';

export type UserRole = 'finance_admin' | 'accountant' | 'reviewer';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  companyId: string;
  companyName: string;
}

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  register: (
    name: string,
    email: string,
    password: string,
    companyName?: string,
    role?: UserRole
  ) => Promise<AuthUser>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(() => {
    return localStorage.getItem('invoiceflow_token');
  });
  const [isLoading, setIsLoading] = useState(true);

  // Validate token and fetch user on initial mount
  useEffect(() => {
    const initAuth = async () => {
      const storedToken = localStorage.getItem('invoiceflow_token');
      if (storedToken) {
        try {
          const res = await fetchApi<{ success: boolean; user: AuthUser }>('/auth/me');
          if (res && res.user) {
            setUser(res.user);
            setToken(storedToken);
          } else {
            // Invalid token
            localStorage.removeItem('invoiceflow_token');
            setToken(null);
            setUser(null);
          }
        } catch {
          localStorage.removeItem('invoiceflow_token');
          setToken(null);
          setUser(null);
        }
      }
      setIsLoading(false);
    };

    initAuth();
  }, []);

  const login = async (email: string, password: string): Promise<AuthUser> => {
    const res = await fetchApi<{ success: boolean; token: string; user: AuthUser }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });

    if (!res || !res.token || !res.user) {
      throw new Error('Invalid response from server.');
    }

    localStorage.setItem('invoiceflow_token', res.token);
    setToken(res.token);
    setUser(res.user);
    return res.user;
  };

  const register = async (
    name: string,
    email: string,
    password: string,
    companyName?: string,
    role: UserRole = 'finance_admin'
  ): Promise<AuthUser> => {
    const res = await fetchApi<{ success: boolean; token: string; user: AuthUser }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password, companyName, role }),
    });

    if (!res || !res.token || !res.user) {
      throw new Error('Invalid response from server.');
    }

    localStorage.setItem('invoiceflow_token', res.token);
    setToken(res.token);
    setUser(res.user);
    return res.user;
  };

  const logout = async (): Promise<void> => {
    try {
      await fetchApi('/auth/logout', { method: 'POST' }).catch(() => {});
    } finally {
      localStorage.removeItem('invoiceflow_token');
      setToken(null);
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: Boolean(token && user),
        isLoading,
        login,
        register,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
