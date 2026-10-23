import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { DEMO_EMAIL, seedDemoBookings, seedDemoGoals, seedDemoJobs } from './demo';

const prisma = new PrismaClient();

const DAYS_AHEAD = 14;
const SLOT_HOURS = [10, 14, 18]; // local server time
const SLOT_MINUTES = 45;

async function upsertUser(email: string, name: string, role: 'user' | 'admin', password: string) {
  const passwordHash = await bcrypt.hash(password, 12);
  return prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, name, role, passwordHash },
  });
}

async function main() {
  const admin = await upsertUser(
    process.env.ADMIN_EMAIL ?? 'admin@mentorloop.dev',
    process.env.ADMIN_NAME ?? 'Alex Morgan',
    'admin',
    process.env.ADMIN_PASSWORD ?? 'admin12345',
  );
  const demo = await upsertUser(DEMO_EMAIL, 'Demo User', 'user', 'demo12345');

  if ((await prisma.service.count()) === 0) {
    await prisma.service.createMany({
      data: [
        {
          name: 'Resume Deep-Dive',
          description:
            'A mentor goes through your CV and LinkedIn line by line, building on your AI review: stronger bullet points, the right keywords and a layout recruiters can scan in seconds.',
          durationMin: 45,
        },
        {
          name: 'Career Guidance Call',
          description:
            'Talk through your next move with a mentor: choosing a direction, switching roles or industries, and building a realistic 90-day job search plan.',
          durationMin: 45,
        },
        {
          name: 'Mock Interview',
          description:
            'A realistic practice interview for your target role, followed by honest, specific feedback on what to improve.',
          durationMin: 60,
        },
      ],
    });
  }

  if ((await prisma.slot.count({ where: { startsAt: { gt: new Date() } } })) === 0) {
    const slots = [];
    for (let day = 1; day <= DAYS_AHEAD; day++) {
      const date = new Date();
      date.setDate(date.getDate() + day);
      if (date.getDay() === 5) continue; // Friday off
      for (const hour of SLOT_HOURS) {
        const startsAt = new Date(date);
        startsAt.setHours(hour, 0, 0, 0);
        slots.push({ startsAt, endsAt: new Date(startsAt.getTime() + SLOT_MINUTES * 60_000) });
      }
    }
    await prisma.slot.createMany({ data: slots });

    await seedDemoBookings(prisma, demo.id);
  }

  if ((await prisma.jobApplication.count({ where: { userId: demo.id } })) === 0) {
    await seedDemoJobs(prisma, demo.id);
  }
  if ((await prisma.weeklyGoal.count({ where: { userId: demo.id } })) === 0) {
    await seedDemoGoals(prisma, demo.id);
  }

  console.log(`Seeded. Admin: ${admin.email}, demo user: ${demo.email}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
