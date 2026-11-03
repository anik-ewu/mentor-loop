import { env } from './config/env';
import { createApp } from './app';
import { prisma } from './lib/prisma';
import { failStaleRuns } from './modules/ai/ai.runner';

const server = createApp().listen(env.PORT, () => {
  console.log(`MentorLoop API listening on http://localhost:${env.PORT}`);
});

// Both look like a working setup from the outside, so say why when they aren't.
if (env.ANTHROPIC_API_KEY && env.AI_MONTHLY_BUDGET_USD === 0) {
  console.warn('AI is paused: AI_MONTHLY_BUDGET_USD is 0. Set a budget above 0 to turn it on.');
}
if (env.BREVO_API_KEY && env.EMAIL_FROM.includes('resend.dev')) {
  console.warn('Brevo is off: set EMAIL_FROM to the sender you verified in Brevo.');
}

failStaleRuns().catch((e) => console.error('Could not clean up interrupted AI runs:', e));

async function shutdown() {
  server.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
