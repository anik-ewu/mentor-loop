import type { PrismaClient } from '@prisma/client';

/** Demo data for the "Try as client" account: a Bangladeshi job search in progress. */

export const DEMO_EMAIL = 'demo@mentorloop.dev';

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);

/** Monday 00:00 UTC of this week; goals saved under another timezone still match it. */
function mondayUtc(d: Date) {
  const day = (d.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day));
}

type Status = 'wishlist' | 'applied' | 'assessment' | 'interviewing' | 'offer' | 'rejected';

interface DemoJob {
  company: string;
  title: string;
  status: Status;
  appliedDaysAgo?: number;
  followUpInDays?: number;
  location: string;
  workMode: 'onsite' | 'hybrid' | 'remote';
  source: string;
  priority: number;
  salaryMin?: number;
  salaryMax?: number;
  jobUrl?: string;
  contactName?: string;
  jobDescription: string;
}

const JOBS: DemoJob[] = [
  {
    company: 'Pathao',
    title: 'Frontend Engineer',
    status: 'interviewing',
    appliedDaysAgo: 16,
    location: 'Gulshan 1, Dhaka',
    workMode: 'hybrid',
    source: 'LinkedIn',
    priority: 3,
    salaryMin: 120_000,
    salaryMax: 180_000,
    contactName: 'Nusrat Jahan (Talent Acquisition)',
    jobDescription:
      'Build and maintain the web apps behind ride-sharing, food and parcel delivery used by millions in Bangladesh. You will work with React, TypeScript and Next.js, consume REST and GraphQL APIs, and care about performance on low-end Android devices and slow mobile networks. 2+ years of React experience, solid JavaScript fundamentals, testing with Jest or Vitest. Experience with design systems, web vitals and Bangla localisation is a plus.',
  },
  {
    company: 'bKash',
    title: 'Software Engineer (Backend)',
    status: 'applied',
    appliedDaysAgo: 4,
    location: 'Tejgaon, Dhaka',
    workMode: 'onsite',
    source: 'BDJobs',
    priority: 3,
    salaryMin: 100_000,
    salaryMax: 160_000,
    jobDescription:
      'Join the payments platform team building secure, high-throughput services for mobile financial services. Java or Node.js, Spring Boot or Express, PostgreSQL/Oracle, Redis and Kafka. You understand transactions, idempotency and API security, and you write tests. Experience with microservices, observability and PCI-DSS style compliance is a plus.',
  },
  {
    company: 'Brain Station 23',
    title: 'Senior Software Engineer',
    status: 'offer',
    appliedDaysAgo: 34,
    location: 'Mohakhali, Dhaka',
    workMode: 'hybrid',
    source: 'Referral',
    priority: 2,
    salaryMin: 150_000,
    salaryMax: 210_000,
    jobDescription:
      'Lead feature development for international client projects in fintech and e-commerce. Full-stack TypeScript (React, NestJS), AWS, CI/CD and code review. 4+ years of experience, strong communication with clients in English, mentoring junior engineers.',
  },
  {
    company: 'SELISE Digital Platforms',
    title: 'Full-Stack Developer',
    status: 'assessment',
    appliedDaysAgo: 11,
    location: 'Banani, Dhaka',
    workMode: 'hybrid',
    source: 'LinkedIn',
    priority: 2,
    salaryMin: 90_000,
    salaryMax: 140_000,
    jobDescription:
      'Build enterprise products for Swiss and European clients. Angular or React on the front end, .NET or Node.js on the back end, Azure, and clean architecture. Take-home assignment followed by technical and culture interviews.',
  },
  {
    company: 'Therap (BD) Ltd.',
    title: 'Junior Software Engineer',
    status: 'applied',
    appliedDaysAgo: 10,
    location: 'Banani, Dhaka',
    workMode: 'onsite',
    source: 'BDJobs',
    priority: 2,
    salaryMin: 60_000,
    salaryMax: 85_000,
    jobDescription:
      'Develop features for a US healthcare SaaS product. Java, Spring, Hibernate, SQL and JavaScript. Strong problem solving (competitive programming is a plus), good understanding of OOP and data structures. Freshers with a CSE degree are welcome.',
  },
  {
    company: 'Cefalo Bangladesh',
    title: 'Software Engineer',
    status: 'wishlist',
    location: 'Banani, Dhaka',
    workMode: 'hybrid',
    source: 'Company site',
    priority: 3,
    jobUrl: 'https://www.cefalo.com/en/career',
    jobDescription:
      'Work in a cross-functional team with Norwegian clients on media and SaaS products. React, TypeScript, Kotlin or .NET, cloud (AWS/GCP), automated testing and agile practices. Good spoken English and ownership of features from idea to production.',
  },
  {
    company: 'Shohoz',
    title: 'Mobile Engineer (React Native)',
    status: 'wishlist',
    location: 'Gulshan 2, Dhaka',
    workMode: 'onsite',
    source: 'LinkedIn',
    priority: 1,
    jobDescription:
      'Build the Shohoz app for bus, launch and event ticketing. React Native, TypeScript, Redux or Zustand, offline-first UX, payments integration (bKash, Nagad, cards) and push notifications. 2+ years of mobile experience.',
  },
  {
    company: 'Chaldal',
    title: 'React Developer',
    status: 'rejected',
    appliedDaysAgo: 27,
    location: 'Tejgaon, Dhaka',
    workMode: 'onsite',
    source: 'BDJobs',
    priority: 1,
    jobDescription:
      'Improve the online grocery storefront and internal warehouse tools. React, TypeScript, F# or C# back end, performance and accessibility. Comfortable working closely with operations teams.',
  },
];

/** Creates the demo pipeline: one or two jobs per stage, with the history that got them there. */
export async function seedDemoJobs(prisma: PrismaClient, userId: string) {
  const path: Status[] = ['wishlist', 'applied', 'assessment', 'interviewing', 'offer'];

  for (const [i, j] of JOBS.entries()) {
    const { appliedDaysAgo, followUpInDays, ...data } = j;
    const appliedAt = appliedDaysAgo == null ? null : daysAgo(appliedDaysAgo);
    // Applied jobs get a follow-up 7 days after applying, as the API does.
    const followUpAt =
      followUpInDays != null
        ? daysAgo(-followUpInDays)
        : j.status === 'applied' && appliedAt
          ? daysAgo(appliedDaysAgo! - 7)
          : null;
    const job = await prisma.jobApplication.create({
      data: {
        ...data,
        currency: data.salaryMin ? 'BDT' : null,
        userId,
        appliedAt,
        followUpAt,
        position: i,
        createdAt: appliedAt ?? daysAgo(1),
      },
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

  const pathao = await prisma.jobApplication.findFirstOrThrow({
    where: { userId, company: 'Pathao' },
  });
  await prisma.jobEvent.createMany({
    data: [
      {
        jobId: pathao.id,
        type: 'interview',
        title: 'HR screening call',
        scheduledAt: daysAgo(9),
        outcome: 'passed',
        notes: 'Asked about notice period and salary expectations.',
        createdAt: daysAgo(10),
      },
      {
        jobId: pathao.id,
        type: 'interview',
        title: 'Technical interview (React + system design)',
        scheduledAt: daysAgo(-3),
        outcome: 'pending',
        createdAt: daysAgo(2),
      },
      {
        jobId: pathao.id,
        type: 'note',
        title: 'Prep',
        notes: 'Revise React rendering, web vitals and how I would design the order-tracking page.',
        createdAt: daysAgo(1),
      },
    ],
  });
}

export async function seedDemoGoals(prisma: PrismaClient, userId: string) {
  const weekStart = mondayUtc(new Date());
  await prisma.weeklyGoal.createMany({
    data: [
      { userId, weekStart, metric: 'applications', target: 5 },
      { userId, weekStart, metric: 'interviews', target: 2 },
      { userId, weekStart, metric: 'follow_ups', target: 3 },
    ],
  });
}

/** Sample mentoring bookings in the first open slots, so the dashboards are not empty. */
export async function seedDemoBookings(prisma: PrismaClient, userId: string) {
  const [resume, guidance] = await prisma.service.findMany({ orderBy: { createdAt: 'asc' } });
  const slots = await prisma.slot.findMany({
    where: { status: 'open', startsAt: { gt: new Date() } },
    orderBy: { startsAt: 'asc' },
    take: 2,
  });
  const samples = [
    {
      slot: slots[0],
      service: resume,
      status: 'confirmed' as const,
      note: 'Applying to Pathao and bKash, want my CV to stand out for product companies',
    },
    {
      slot: slots[1],
      service: guidance,
      status: 'pending' as const,
      note: 'I have an offer from Brain Station 23. Should I take it or keep going for a product company?',
    },
  ];
  for (const s of samples) {
    if (!s.slot || !s.service) continue;
    await prisma.slot.update({ where: { id: s.slot.id }, data: { status: 'booked' } });
    await prisma.booking.create({
      data: { userId, slotId: s.slot.id, serviceId: s.service.id, status: s.status, note: s.note },
    });
  }
}

/** Wipes everything the demo account has made (jobs, AI results, goals, bookings). */
export async function resetDemo(prisma: PrismaClient, userId: string) {
  const bookings = await prisma.booking.findMany({ where: { userId }, select: { slotId: true } });
  await prisma.$transaction([
    prisma.booking.deleteMany({ where: { userId } }),
    prisma.slot.updateMany({
      where: { id: { in: bookings.map((b) => b.slotId) } },
      data: { status: 'open' },
    }),
    prisma.aiRun.deleteMany({ where: { userId } }),
    prisma.jobApplication.deleteMany({ where: { userId } }), // events cascade
    prisma.weeklyGoal.deleteMany({ where: { userId } }),
  ]);
}
