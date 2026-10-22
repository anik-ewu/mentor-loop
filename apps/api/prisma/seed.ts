import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

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
    'Sabbir Hasan',
    'admin',
    process.env.ADMIN_PASSWORD ?? 'admin12345',
  );
  const demo = await upsertUser('demo@mentorloop.dev', 'Demo User', 'user', 'demo12345');

  if ((await prisma.service.count()) === 0) {
    await prisma.service.createMany({
      data: [
        {
          name: 'Resume Review',
          description:
            'Line-by-line feedback on your CV: impact bullets, ATS keywords and layout, so recruiters call you back.',
          durationMin: 45,
        },
        {
          name: 'Career Guidance',
          description:
            'A 1:1 talk about your next move: tech stack, job switch, interview prep plan and salary negotiation.',
          durationMin: 45,
        },
        {
          name: 'Mock Interview',
          description:
            'A realistic technical interview (DSA, system design or backend depth) with honest written feedback.',
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

    // A few sample bookings so the dashboards are not empty.
    const [resume, career] = await prisma.service.findMany({ orderBy: { createdAt: 'asc' } });
    const firstSlots = await prisma.slot.findMany({ orderBy: { startsAt: 'asc' }, take: 2 });
    const samples = [
      { slot: firstSlots[0], service: resume, status: 'confirmed' as const, note: 'Backend role at a fintech' },
      { slot: firstSlots[1], service: career, status: 'pending' as const, note: 'Switching from .NET to AI engineering' },
    ];
    for (const s of samples) {
      if (!s.slot || !s.service) continue;
      await prisma.slot.update({ where: { id: s.slot.id }, data: { status: 'booked' } });
      await prisma.booking.create({
        data: { userId: demo.id, slotId: s.slot.id, serviceId: s.service.id, status: s.status, note: s.note },
      });
    }
  }

  console.log(`Seeded. Admin: ${admin.email}, demo user: ${demo.email}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
