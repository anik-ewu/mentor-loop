import { api } from './client';
import type { AuthConfig, Role, User } from './types';

type UserRes = { user: User };

export const authApi = {
  config: () => api<AuthConfig>('/auth/config'),
  me: () => api<{ user: User | null }>('/auth/me').then((r) => r.user),
  login: (body: { email: string; password: string }) =>
    api<UserRes>('/auth/login', 'POST', body).then((r) => r.user),
  signup: (body: { name: string; email: string; password: string }) =>
    api<UserRes>('/auth/signup', 'POST', body).then((r) => r.user),
  google: (credential: string) =>
    api<UserRes>('/auth/google', 'POST', { credential }).then((r) => r.user),
  demo: (role: Role) => api<UserRes>('/auth/demo', 'POST', { role }).then((r) => r.user),
  logout: () => api<void>('/auth/logout', 'POST'),
  updateMe: (body: { timezone?: string }) =>
    api<UserRes>('/auth/me', 'PATCH', body).then((r) => r.user),
};
