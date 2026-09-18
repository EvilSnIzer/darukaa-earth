import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { authApi } from '../api/endpoints';
import { tokenStore } from '../api/client';
import type { TokenResponse, User } from '../types';

interface AuthContextValue {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isAdmin: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (input: { email: string; full_name: string; password: string }) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // On mount, validate any stored token so a refresh keeps the session alive.
  useEffect(() => {
    let cancelled = false;
    const token = tokenStore.access;
    if (!token) {
      setIsLoading(false);
      return;
    }
    authApi
      .me()
      .then((me) => {
        if (!cancelled) setUser(me);
      })
      .catch(() => {
        if (!cancelled) tokenStore.clear();
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const applySession = useCallback((session: TokenResponse) => {
    tokenStore.set(session.access_token, session.refresh_token);
    setUser(session.user);
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      applySession(await authApi.login(email, password));
    },
    [applySession],
  );

  const register = useCallback(
    async (input: { email: string; full_name: string; password: string }) => {
      applySession(await authApi.register(input));
    },
    [applySession],
  );

  const logout = useCallback(() => {
    // Fire-and-forget: JWTs are stateless, so the local discard is what matters.
    void authApi.logout().catch(() => undefined);
    tokenStore.clear();
    setUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: user !== null,
      isLoading,
      isAdmin: user?.role === 'admin',
      login,
      register,
      logout,
    }),
    [user, isLoading, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}
