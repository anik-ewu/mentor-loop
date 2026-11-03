import { existsSync } from 'node:fs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

/** For the seed scripts, which run in the container without src/ and so can't use lib/prisma. */
export function createScriptClient() {
  if (existsSync('.env')) process.loadEnvFile('.env');
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });
}
