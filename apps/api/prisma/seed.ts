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
    process.env.ADMIN_NAME ?? 'Alex Morgan',
    'admin',
    process.env.ADMIN_PASSWORD ?? 'admin12345',
  );
  const demo = await upsertUser('demo@mentorloop.dev', 'Demo User', 'user', 'demo12345');

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

    // A few sample bookings so the dashboards are not empty.
    const [resume, strategy] = await prisma.service.findMany({ orderBy: { createdAt: 'asc' } });
    const firstSlots = await prisma.slot.findMany({ orderBy: { startsAt: 'asc' }, take: 2 });
    const samples = [
      {
        slot: firstSlots[0],
        service: resume,
        status: 'confirmed' as const,
        note: 'Applying for product roles, want my CV to stand out',
      },
      {
        slot: firstSlots[1],
        service: strategy,
        status: 'pending' as const,
        note: 'Thinking about a move into data analytics',
      },
    ];
    for (const s of samples) {
      if (!s.slot || !s.service) continue;
      await prisma.slot.update({ where: { id: s.slot.id }, data: { status: 'booked' } });
      await prisma.booking.create({
        data: {
          userId: demo.id,
          slotId: s.slot.id,
          serviceId: s.service.id,
          status: s.status,
          note: s.note,
        },
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
