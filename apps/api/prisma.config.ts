import { existsSync } from 'node:fs';
import { defineConfig } from 'prisma/config';

// Prisma 7 no longer reads .env by itself. Docker and CI pass real env vars instead.
if (existsSync('.env')) process.loadEnvFile('.env');

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { seed: 'tsx prisma/seed.ts' },
  // Not env(): that throws when it's unset, and `prisma generate` runs in the Docker build without it.
  datasource: { url: process.env.DATABASE_URL ?? '' },
});
