import React, { createContext, useContext, useState, useEffect } from 'react';
import { fetchApi } from '../services/api';

export type UserRole = 'owner' | 'member' | 'finance_admin' | 'accountant' | 'reviewer';

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
  isOwner: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  register: (
    name: string,
    email: string,
    password: string,
    companyName?: string,
    role?: UserRole,
    invitationToken?: string
  ) => Promise<AuthUser>;
  updateUserCompany: (companyName: string) => void;
  loginWithToken: (token: string, user: AuthUser) => void;
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

  // Listen for global session expiration events
  useEffect(() => {
    const handleUnauthorized = () => {
      localStorage.removeItem('invoiceflow_token');
      setToken(null);
      setUser(null);
    };

    window.addEventListener('invoiceflow:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('invoiceflow:unauthorized', handleUnauthorized);
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
    role: UserRole = 'owner',
    invitationToken?: string
  ): Promise<AuthUser> => {
    const res = await fetchApi<{ success: boolean; token: string; user: AuthUser }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password, companyName, role, invitationToken }),
    });

    if (!res || !res.token || !res.user) {
      throw new Error('Invalid response from server.');
    }

    localStorage.setItem('invoiceflow_token', res.token);
    setToken(res.token);
    setUser(res.user);
    return res.user;
  };

  const updateUserCompany = (companyName: string) => {
    if (user) {
      setUser({ ...user, companyName });
    }
  };

  const loginWithToken = (newToken: string, newUser: AuthUser) => {
    localStorage.setItem('invoiceflow_token', newToken);
    setToken(newToken);
    setUser(newUser);
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

  const isOwner = Boolean(user?.role === 'owner' || user?.role === 'finance_admin');

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: Boolean(token && user),
        isOwner,
        isLoading,
        login,
        register,
        updateUserCompany,
        loginWithToken,
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
