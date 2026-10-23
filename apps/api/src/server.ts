import { env } from './config/env';
import { createApp } from './app';
import { prisma } from './lib/prisma';
import { failStaleRuns } from './modules/ai/ai.runner';

const server = createApp().listen(env.PORT, () => {
  console.log(`MentorLoop API listening on http://localhost:${env.PORT}`);
});

failStaleRuns().catch((e) => console.error('Could not clean up interrupted AI runs:', e));

async function shutdown() {
  server.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
