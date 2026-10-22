import type { BookingStatus, Role } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors';
import type { CreateBookingInput } from './bookings.schema';

const ACTIVE: BookingStatus[] = ['pending', 'confirmed'];

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
} as const;

export async function create(userId: string, input: CreateBookingInput) {
  return prisma.$transaction(async (tx) => {
    const service = await tx.service.findFirst({ where: { id: input.serviceId, isActive: true } });
    if (!service) throw notFound('Service');

    // Atomic claim: only one request can flip an open slot to booked.
    const claimed = await tx.slot.updateMany({
      where: { id: input.slotId, status: 'open', startsAt: { gt: new Date() } },
      data: { status: 'booked' },
    });
    if (claimed.count === 0) throw conflict('Sorry, this slot was just taken. Please pick another.');

    return tx.booking.create({ data: { ...input, userId }, include: withDetails });
  });
}

export const listForUser = (userId: string) =>
  prisma.booking.findMany({
    where: { userId },
    orderBy: { slot: { startsAt: 'desc' } },
    include: withDetails,
  });

export const listAll = (status?: BookingStatus) =>
  prisma.booking.findMany({
    where: status ? { status } : undefined,
    orderBy: { slot: { startsAt: 'asc' } },
    include: withDetails,
  });

async function setStatus(id: string, status: BookingStatus) {
  return prisma.$transaction(async (tx) => {
    const booking = await tx.booking.update({ where: { id }, data: { status }, include: withDetails });
    if (status === 'cancelled') {
      await tx.slot.update({ where: { id: booking.slotId }, data: { status: 'open' } });
    }
    return booking;
  });
}

export async function cancel(id: string, actor: { id: string; role: Role }) {
  const booking = await prisma.booking.findUnique({ where: { id } });
  if (!booking) throw notFound('Booking');
  if (actor.role !== 'admin' && booking.userId !== actor.id) throw forbidden();
  if (!ACTIVE.includes(booking.status)) throw badRequest(`This booking is already ${booking.status}`);
  return setStatus(id, 'cancelled');
}

export async function updateStatus(id: string, status: BookingStatus) {
  const booking = await prisma.booking.findUnique({ where: { id } });
  if (!booking) throw notFound('Booking');
  if (!TRANSITIONS[booking.status].includes(status)) {
    throw badRequest(`A ${booking.status} booking cannot be marked ${status}`);
  }
  return setStatus(id, status);
}

export async function stats() {
  const [byStatus, users, openSlots, next] = await Promise.all([
    prisma.booking.groupBy({ by: ['status'], _count: true }),
    prisma.user.count({ where: { role: 'user' } }),
    prisma.slot.count({ where: { status: 'open', startsAt: { gt: new Date() } } }),
    prisma.booking.findFirst({
      where: { status: { in: ACTIVE }, slot: { startsAt: { gt: new Date() } } },
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
    nextBooking: next,
  };
}
