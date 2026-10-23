import { z } from 'zod';
import { isValidTimezone } from '../../lib/timezone';

export const signupSchema = z.object({
  name: z.string().trim().min(2, 'Name is too short').max(80),
  email: z.email('Enter a valid email').trim().toLowerCase(),
  password: z.string().min(8, 'Use at least 8 characters').max(128),
});

export const loginSchema = z.object({
  email: z.email('Enter a valid email').trim().toLowerCase(),
  password: z.string().min(1, 'Password is required'),
});

export const googleSchema = z.object({
  credential: z.string().min(1),
});

export const forgotPasswordSchema = z.object({
  email: z.email('Enter a valid email').trim().toLowerCase(),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8, 'Use at least 8 characters').max(128),
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
