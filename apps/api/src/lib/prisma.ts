import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { env } from '../config/env';

export const prisma = new PrismaClient({
  // pg waits forever by default. A bounded wait gives a clear error if the database is unreachable.
  adapter: new PrismaPg({ connectionString: env.DATABASE_URL, connectionTimeoutMillis: 10_000 }),
});
