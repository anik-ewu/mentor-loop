import { createContext, useCallback, useContext, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { authApi } from '../api/auth';
import type { AuthConfig, User } from '../api/types';

interface AuthState {
  user: User | null;
  loading: boolean;
  config: AuthConfig;
  /** Call after any successful login/signup. */
  setUser: (user: User | null) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const me = useQuery({ queryKey: ['me'], queryFn: authApi.me, staleTime: Infinity });
  const config = useQuery({
    queryKey: ['auth-config'],
    queryFn: authApi.config,
    staleTime: Infinity,
  });

  const setUser = useCallback(
    (user: User | null) => {
      // Drop cached data from the previous session, then set the new user.
      qc.removeQueries({
        predicate: (q) => !['me', 'auth-config'].includes(q.queryKey[0] as string),
      });
      qc.setQueryData(['me'], user);
    },
    [qc],
  );

  const logout = useCallback(async () => {
    await authApi.logout();
    setUser(null);
  }, [setUser]);

  return (
    <AuthContext.Provider
      value={{
        user: me.data ?? null,
        loading: me.isPending,
        config: config.data ?? { googleClientId: null, demoMode: false },
        setUser,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

/** Where to send a user right after login. */
export const homeFor = (user: User) => (user.role === 'admin' ? '/admin' : '/app');
