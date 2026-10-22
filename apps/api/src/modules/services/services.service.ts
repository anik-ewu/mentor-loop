import { prisma } from '../../lib/prisma';
import { notFound } from '../../lib/errors';
import type { CreateServiceInput, UpdateServiceInput } from './services.schema';

export const listActive = () =>
  prisma.service.findMany({ where: { isActive: true }, orderBy: { createdAt: 'asc' } });

export const listAll = () => prisma.service.findMany({ orderBy: { createdAt: 'asc' } });

export const create = (input: CreateServiceInput) => prisma.service.create({ data: input });

export async function update(id: string, input: UpdateServiceInput) {
  const existing = await prisma.service.findUnique({ where: { id } });
  if (!existing) throw notFound('Service');
  return prisma.service.update({ where: { id }, data: input });
}
