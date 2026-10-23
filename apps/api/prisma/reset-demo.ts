import { PrismaClient } from '@prisma/client';
import { DEMO_EMAIL, resetDemo, seedDemoBookings, seedDemoGoals, seedDemoJobs } from './demo';

/** Replaces the demo account's jobs, AI results, goals and bookings with fresh demo data. */
const prisma = new PrismaClient();

async function main() {
  const demo = await prisma.user.findUnique({ where: { email: DEMO_EMAIL } });
  if (!demo) throw new Error(`No demo user (${DEMO_EMAIL}): run npm run db:seed first`);
  await resetDemo(prisma, demo.id);
  await seedDemoJobs(prisma, demo.id);
  await seedDemoGoals(prisma, demo.id);
  await seedDemoBookings(prisma, demo.id);
  console.log(`Demo data reset for ${demo.email}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
