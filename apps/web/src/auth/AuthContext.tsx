import { createContext, useCallback, useContext, useEffect, type ReactNode } from 'react';
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
    // A free-tier API can take a minute to wake up: keep trying (1, 2, 4, 8, 10, 10 s) instead of
    // settling on "no Google, no demo" for the rest of the visit.
    retry: 6,
    retryDelay: (n) => Math.min(1000 * 2 ** n, 10_000),
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

  // Goals and streaks use the user's local week, so keep the stored timezone in sync.
  const user = me.data;
  useEffect(() => {
    if (!user) return;
    let tz: string;
    try {
      tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return;
    }
    if (!tz || tz === user.timezone) return;
    authApi
      .updateMe({ timezone: tz })
      .then((updated) => {
        qc.setQueryData(['me'], updated);
        qc.invalidateQueries({ queryKey: ['goals'] });
      })
      .catch(() => {
        /* not critical: goals fall back to the stored timezone */
      });
  }, [user, qc]);

  const logout = useCallback(async () => {
    await authApi.logout();
    setUser(null);
  }, [setUser]);

  return (
    <AuthContext.Provider
      value={{
        user: me.data ?? null,
        loading: me.isPending,
        config: config.data ?? {
          googleClientId: null,
          demoMode: false,
          aiEnabled: false,
          passwordResetEnabled: false,
        },
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
