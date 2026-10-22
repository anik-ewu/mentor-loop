import { env } from './config/env';
import { createApp } from './app';
import { prisma } from './lib/prisma';

const server = createApp().listen(env.PORT, () => {
  console.log(`MentorLoop API listening on http://localhost:${env.PORT}`);
});

async function shutdown() {
  server.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
