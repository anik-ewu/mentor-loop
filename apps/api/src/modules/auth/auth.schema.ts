import { z } from 'zod';
import { isValidTimezone } from '../../lib/timezone';

/** 254 is the longest address email allows. Rate limits keep this value in memory as a key. */
const email = z.email('Enter a valid email').max(254, 'Enter a valid email').trim().toLowerCase();

/**
 * Only for new passwords: older, shorter ones can still log in. bcrypt reads just the first 72
 * bytes, so anything longer would quietly ignore the rest.
 */
const newPassword = z
  .string()
  .min(12, 'Use at least 12 characters')
  .refine((p) => Buffer.byteLength(p) <= 72, 'Use at most 72 characters');

/** 6 digits from the app, or a recovery code. */
const twoFactorCode = z.string().trim().min(6, 'Enter the code').max(32, 'Enter the code');

export const signupSchema = z.object({
  name: z.string().trim().min(2, 'Name is too short').max(80),
  email,
  password: newPassword,
});

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Password is required').max(128, 'Email or password is incorrect'),
});

export const googleSchema = z.object({
  credential: z.string().min(1),
});

export const forgotPasswordSchema = z.object({
  email,
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1).max(200),
  password: newPassword,
});

export const verifyEmailSchema = z.object({
  token: z.string().min(1).max(200),
  password: z.string().min(1, 'Enter your password').max(128),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Enter your current password').max(128),
  newPassword,
});

export const twoFactorLoginSchema = z.object({
  ticket: z.string().min(1).max(1000),
  code: twoFactorCode,
});

/** Accounts created with Google have no password to confirm. */
export const twoFactorSetupSchema = z.object({
  password: z.string().max(128).optional(),
});

export const twoFactorCodeSchema = z.object({
  code: twoFactorCode,
});

export const demoSchema = z.object({
  role: z.enum(['user', 'admin']),
});

export const updateMeSchema = z.object({
  /** IANA name from the browser, e.g. "Asia/Dhaka". */
  timezone: z.string().max(64).refine(isValidTimezone, 'Unknown timezone').optional(),
});

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
