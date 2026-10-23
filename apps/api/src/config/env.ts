import { existsSync } from 'node:fs';
import { z } from 'zod';

// Local dev reads apps/api/.env; Docker and CI pass real env vars (which take precedence).
if (existsSync('.env')) process.loadEnvFile('.env');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  CLIENT_ORIGIN: z.string().default('http://localhost:5173'),
  GOOGLE_CLIENT_ID: z.string().default(''),
  // Optional: empty hides the AI coach features.
  ANTHROPIC_API_KEY: z.string().default(''),
  ANTHROPIC_MODEL: z.string().default('claude-haiku-5-5'),
  AI_DAILY_LIMIT: z.coerce.number().int().min(0).default(10),
  // USD per million tokens, used to price each run (defaults: Claude Haiku 5.5).
  AI_PRICE_INPUT_PER_MTOK: z.coerce.number().min(0).default(0.1),
  AI_PRICE_OUTPUT_PER_MTOK: z.coerce.number().min(0).default(0.5),
  // Spend cap per calendar month (UTC) across all users; 0 = no cap.
  AI_MONTHLY_BUDGET_USD: z.coerce.number().min(0).default(0),
  // Optional: Resend API key for password reset emails. Empty logs the reset link instead.
  RESEND_API_KEY: z.string().default(''),
  EMAIL_FROM: z.string().default('MentorLoop <onboarding@resend.dev>'),
  DEMO_MODE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment variables:', z.flattenError(parsed.error).fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
