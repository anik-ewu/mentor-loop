import { prisma } from '../../lib/prisma';
import { conflict, notFound } from '../../lib/errors';
import type { CreateSlotInput } from './slots.schema';

/** Open, future slots that users can book. */
export const listOpen = () =>
  prisma.slot.findMany({
    where: { status: 'open', startsAt: { gt: new Date() } },
    orderBy: { startsAt: 'asc' },
  });

/** Upcoming slots with their active booking, for the admin calendar. */
export const listUpcoming = () =>
  prisma.slot.findMany({
    where: { startsAt: { gt: new Date() } },
    orderBy: { startsAt: 'asc' },
    include: {
      bookings: {
        where: { status: { in: ['pending', 'confirmed'] } },
        include: { user: { select: { name: true, email: true } }, service: true },
      },
    },
  });

export async function create(input: CreateSlotInput) {
  const overlapping = await prisma.slot.findFirst({
    where: { startsAt: { lt: input.endsAt }, endsAt: { gt: input.startsAt } },
  });
  if (overlapping) throw conflict('This time overlaps an existing slot');
  return prisma.slot.create({ data: input });
}

export async function remove(id: string) {
  const slot = await prisma.slot.findUnique({ where: { id } });
  if (!slot) throw notFound('Slot');
  if (slot.status === 'booked') throw conflict('This slot is booked. Cancel the booking first.');
  await prisma.slot.delete({ where: { id } });
}
