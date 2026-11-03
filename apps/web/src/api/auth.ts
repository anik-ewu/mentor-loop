import { api } from './client';
import type { AuthConfig, LoginResult, Role, User } from './types';

type UserRes = { user: User };

export const authApi = {
  config: () => api<AuthConfig>('/auth/config'),
  me: () => api<{ user: User | null }>('/auth/me').then((r) => r.user),
  login: (body: { email: string; password: string }) =>
    api<LoginResult>('/auth/login', 'POST', body),
  /** Answers the same for any email: the next step arrives by email. */
  signup: (body: { name: string; email: string; password: string }) =>
    api<{ verificationRequired: true }>('/auth/signup', 'POST', body),
  verifyEmail: (body: { token: string; password: string }) =>
    api<void>('/auth/verify-email', 'POST', body),
  google: (credential: string) => api<LoginResult>('/auth/google', 'POST', { credential }),
  twoFactorLogin: (body: { ticket: string; code: string }) =>
    api<UserRes>('/auth/2fa/login', 'POST', body).then((r) => r.user),
  twoFactorSetup: (password?: string) =>
    api<{ secret: string; otpauthUrl: string }>('/auth/2fa/setup', 'POST', { password }),
  twoFactorEnable: (code: string) =>
    api<{ recoveryCodes: string[] }>('/auth/2fa/enable', 'POST', { code }).then(
      (r) => r.recoveryCodes,
    ),
  twoFactorDisable: (code: string) =>
    api<UserRes>('/auth/2fa/disable', 'POST', { code }).then((r) => r.user),
  changePassword: (body: { currentPassword: string; newPassword: string }) =>
    api<UserRes>('/auth/change-password', 'POST', body).then((r) => r.user),
  forgotPassword: (email: string) => api<void>('/auth/forgot-password', 'POST', { email }),
  resetPassword: (body: { token: string; password: string }) =>
    api<LoginResult>('/auth/reset-password', 'POST', body),
  demo: (role: Role) => api<UserRes>('/auth/demo', 'POST', { role }).then((r) => r.user),
  logout: () => api<void>('/auth/logout', 'POST'),
  updateMe: (body: { timezone?: string }) =>
    api<UserRes>('/auth/me', 'PATCH', body).then((r) => r.user),
};
