import type { BookingStatus, Prisma, Role } from '@prisma/client';
import { demoOwnerFilter } from '../../lib/demo';
import { prisma } from '../../lib/prisma';
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors';
import type { CreateBookingInput } from './bookings.schema';

const ACTIVE: BookingStatus[] = ['pending', 'confirmed'];

/** Upcoming sessions one account can hold, so nobody can take every open slot. */
export const MAX_ACTIVE_BOOKINGS = 3;

/** Which status changes the admin may make from each state. */
const TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['completed', 'cancelled'],
  cancelled: [],
  completed: [],
};

const withDetails = {
  slot: true,
  service: { select: { id: true, name: true, durationMin: true } },
  user: { select: { id: true, name: true, email: true, avatarUrl: true } },
  resumeReview: { select: { id: true, score: true, input: true, result: true } },
} as const;

type BookingWithDetails = Prisma.BookingGetPayload<{ include: typeof withDetails }>;

/** Replaces the attached review's full result with what the mentor's card needs. */
function shape<T extends BookingWithDetails | null>(booking: T) {
  if (!booking) return booking;
  const { resumeReview: review, ...rest } = booking;
  const result = review?.result as { summary?: string } | null | undefined;
  const input = review?.input as { targetRole?: string | null } | null | undefined;
  return {
    ...rest,
    resumeReview: review && {
      id: review.id,
      score: review.score,
      summary: result?.summary ?? null,
      targetRole: input?.targetRole ?? null,
    },
  };
}

export async function create(userId: string, input: CreateBookingInput) {
  if (input.resumeReviewId) {
    const review = await prisma.aiRun.findFirst({
      where: { id: input.resumeReviewId, userId, kind: 'resume_review', status: 'done' },
    });
    if (!review) throw badRequest('That AI review cannot be attached to a booking');
  }
  const booking = await prisma.$transaction(async (tx) => {
    // Locks this user's row: parallel requests take turns here, so they can't all pass the count.
    await tx.$queryRaw`SELECT 1 FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
    const active = await tx.booking.count({
      where: { userId, status: { in: ACTIVE }, slot: { startsAt: { gt: new Date() } } },
    });
    if (active >= MAX_ACTIVE_BOOKINGS) {
      throw conflict(
        `You can have up to ${MAX_ACTIVE_BOOKINGS} upcoming sessions. Cancel one to book another.`,
      );
    }

    const service = await tx.service.findFirst({ where: { id: input.serviceId, isActive: true } });
    if (!service) throw notFound('Service');

    // Atomic claim: only one request can flip an open slot to booked.
    const claimed = await tx.slot.updateMany({
      where: { id: input.slotId, status: 'open', startsAt: { gt: new Date() } },
      data: { status: 'booked' },
    });
    if (claimed.count === 0)
      throw conflict('Sorry, this slot was just taken. Please pick another.');

    return tx.booking.create({ data: { ...input, userId }, include: withDetails });
  });
  return shape(booking);
}

export const listForUser = (userId: string) =>
  prisma.booking
    .findMany({
      where: { userId },
      orderBy: { slot: { startsAt: 'desc' } },
      include: withDetails,
    })
    .then((list) => list.map(shape));

export const listAll = (status?: BookingStatus, onlySampleData = false) =>
  prisma.booking
    .findMany({
      where: {
        ...(status && { status }),
        ...(onlySampleData && { user: demoOwnerFilter }),
      },
      orderBy: { slot: { startsAt: 'asc' } },
      include: withDetails,
    })
    .then((list) => list.map(shape));

/**
 * Conditional on the status the caller checked. Otherwise a second, parallel cancel would reopen the
 * slot after someone else had booked it, and a third person could then double-book it.
 */
async function setStatus(id: string, from: BookingStatus, status: BookingStatus) {
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.booking.updateMany({
      where: { id, status: from },
      data: { status },
    });
    if (count !== 1) throw conflict('This booking was just changed. Refresh and try again.');
    const booking = await tx.booking.findUniqueOrThrow({ where: { id }, include: withDetails });
    if (status === 'cancelled') {
      await tx.slot.update({ where: { id: booking.slotId }, data: { status: 'open' } });
    }
    return shape(booking);
  });
}

export async function cancel(id: string, actor: { id: string; role: Role }) {
  const booking = await prisma.booking.findUnique({ where: { id } });
  if (!booking) throw notFound('Booking');
  if (actor.role !== 'admin' && booking.userId !== actor.id) throw forbidden();
  if (!ACTIVE.includes(booking.status))
    throw badRequest(`This booking is already ${booking.status}`);
  return setStatus(id, booking.status, 'cancelled');
}

export async function updateStatus(id: string, status: BookingStatus) {
  const booking = await prisma.booking.findUnique({ where: { id } });
  if (!booking) throw notFound('Booking');
  if (!TRANSITIONS[booking.status].includes(status)) {
    throw badRequest(`A ${booking.status} booking cannot be marked ${status}`);
  }
  return setStatus(id, booking.status, status);
}

export async function stats(onlySampleData = false) {
  const owner = onlySampleData ? { user: demoOwnerFilter } : {};
  const [byStatus, users, openSlots, next] = await Promise.all([
    prisma.booking.groupBy({ by: ['status'], where: owner, _count: true }),
    prisma.user.count({ where: { role: 'user', ...(onlySampleData && demoOwnerFilter) } }),
    prisma.slot.count({ where: { status: 'open', startsAt: { gt: new Date() } } }),
    prisma.booking.findFirst({
      where: { ...owner, status: { in: ACTIVE }, slot: { startsAt: { gt: new Date() } } },
      orderBy: { slot: { startsAt: 'asc' } },
      include: withDetails,
    }),
  ]);
  const counts = Object.fromEntries(byStatus.map((s) => [s.status, s._count]));
  return {
    pending: counts.pending ?? 0,
    confirmed: counts.confirmed ?? 0,
    completed: counts.completed ?? 0,
    cancelled: counts.cancelled ?? 0,
    users,
    openSlots,
    nextBooking: shape(next),
  };
}
