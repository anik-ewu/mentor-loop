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

  if ((await prisma.jobApplication.count({ where: { userId: demo.id } })) === 0) {
    await seedJobs(demo.id);
  }

  if ((await prisma.weeklyGoal.count({ where: { userId: demo.id } })) === 0) {
    const weekStart = mondayUtc(new Date());
    await prisma.weeklyGoal.createMany({
      data: [
        { userId: demo.id, weekStart, metric: 'applications', target: 5 },
        { userId: demo.id, weekStart, metric: 'interviews', target: 2 },
        { userId: demo.id, weekStart, metric: 'follow_ups', target: 3 },
      ],
    });
  }

  console.log(`Seeded. Admin: ${admin.email}, demo user: ${demo.email}`);
}

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);

/** Monday 00:00 UTC of the given date's week (the demo user's timezone is UTC). */
function mondayUtc(d: Date) {
  const day = (d.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day));
}

type Status = 'wishlist' | 'applied' | 'assessment' | 'interviewing' | 'offer' | 'rejected';

/** Demo pipeline: one job per stage, with the status changes that got it there. */
async function seedJobs(userId: string) {
  const path: Status[] = ['wishlist', 'applied', 'assessment', 'interviewing', 'offer'];
  const jobs: {
    company: string;
    title: string;
    status: Status;
    appliedDaysAgo?: number;
    location: string;
    workMode: 'onsite' | 'hybrid' | 'remote';
    source: string;
    priority: number;
    followUpAt?: Date;
    jobDescription?: string;
  }[] = [
    {
      company: 'Northwind Labs',
      title: 'Frontend Engineer',
      status: 'wishlist',
      location: 'Berlin',
      workMode: 'hybrid',
      source: 'LinkedIn',
      priority: 1,
      jobDescription:
        'We are looking for a frontend engineer with strong React and TypeScript skills to build our analytics dashboard. Experience with design systems, accessibility and testing (Vitest, Playwright) is a plus.',
    },
    {
      company: 'Brightpath',
      title: 'Full-stack Developer',
      status: 'applied',
      appliedDaysAgo: 9,
      location: 'Remote',
      workMode: 'remote',
      source: 'Company site',
      priority: 2,
    },
    {
      company: 'Quanta Health',
      title: 'Software Engineer, Platform',
      status: 'applied',
      appliedDaysAgo: 2,
      location: 'London',
      workMode: 'hybrid',
      source: 'Referral',
      priority: 1,
      followUpAt: daysAgo(-5),
    },
    {
      company: 'Fernway',
      title: 'React Developer',
      status: 'assessment',
      appliedDaysAgo: 12,
      location: 'Remote',
      workMode: 'remote',
      source: 'Wellfound',
      priority: 2,
    },
    {
      company: 'Atlas Mobility',
      title: 'Senior Frontend Engineer',
      status: 'interviewing',
      appliedDaysAgo: 18,
      location: 'Amsterdam',
      workMode: 'onsite',
      source: 'LinkedIn',
      priority: 1,
    },
    {
      company: 'Lumen Retail',
      title: 'Web Engineer',
      status: 'offer',
      appliedDaysAgo: 30,
      location: 'Dublin',
      workMode: 'hybrid',
      source: 'Recruiter',
      priority: 2,
    },
    {
      company: 'Corvid Systems',
      title: 'Junior Developer',
      status: 'rejected',
      appliedDaysAgo: 25,
      location: 'Remote',
      workMode: 'remote',
      source: 'Indeed',
      priority: 3,
    },
  ];

  for (const [i, j] of jobs.entries()) {
    const { appliedDaysAgo, ...data } = j;
    const appliedAt = appliedDaysAgo == null ? null : daysAgo(appliedDaysAgo);
    const job = await prisma.jobApplication.create({
      data: { ...data, userId, appliedAt, position: i, createdAt: appliedAt ?? daysAgo(1) },
    });
    if (!appliedAt) continue;

    // Status changes from wishlist to the current stage, spread out after applying.
    const stages: Status[] = j.status === 'rejected' ? ['wishlist', 'applied', 'rejected'] : path;
    for (let s = 1; s <= stages.indexOf(j.status); s++) {
      await prisma.jobEvent.create({
        data: {
          jobId: job.id,
          type: 'status_change',
          fromStatus: stages[s - 1],
          toStatus: stages[s],
          createdAt: daysAgo(Math.max(0, appliedDaysAgo! - (s - 1) * 5)),
        },
      });
    }
  }

  const atlas = await prisma.jobApplication.findFirstOrThrow({
    where: { userId, company: 'Atlas Mobility' },
  });
  await prisma.jobEvent.createMany({
    data: [
      {
        jobId: atlas.id,
        type: 'interview',
        title: 'Recruiter screen',
        scheduledAt: daysAgo(6),
        outcome: 'passed',
        createdAt: daysAgo(8),
      },
      {
        jobId: atlas.id,
        type: 'interview',
        title: 'Technical interview',
        scheduledAt: daysAgo(-2),
        outcome: 'pending',
        createdAt: daysAgo(1),
      },
    ],
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
