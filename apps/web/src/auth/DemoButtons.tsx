import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authApi } from '../api/auth';
import type { Role } from '../api/types';
import { Button } from '../components/Button';
import { useToast } from '../components/Toast';
import { homeFor, useAuth } from './AuthContext';

/** One-click demo accounts. Only rendered when the API runs with DEMO_MODE=true. */
export function DemoButtons({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const { config, setUser } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [pending, setPending] = useState<Role | null>(null);

  if (!config.demoMode) return null;

  const tryAs = async (role: Role) => {
    setPending(role);
    try {
      const user = await authApi.demo(role);
      setUser(user);
      toast(`Welcome! You're exploring as the demo ${role === 'admin' ? 'admin' : 'client'}.`);
      navigate(homeFor(user));
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="row">
      <Button size={size} onClick={() => tryAs('user')} loading={pending === 'user'}>
        Try as client
      </Button>
      <Button size={size} onClick={() => tryAs('admin')} loading={pending === 'admin'}>
        Try as admin
      </Button>
    </div>
  );
}
