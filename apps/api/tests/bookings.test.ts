import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/prisma';
import { app, createService, createSlot, loginAs, resetDb } from './helpers';

beforeEach(resetDb);

describe('bookings', () => {
  it('requires login to book and admin to manage', async () => {
    await request(app).post('/api/bookings').send({}).expect(401);
    const { agent } = await loginAs('user');
    await agent.get('/api/bookings').expect(403);
    await agent.post('/api/slots').send({}).expect(403);
  });

  it('books an open slot and marks it booked', async () => {
    const [service, slot] = await Promise.all([createService(), createSlot()]);
    const { agent } = await loginAs('user');

    const res = await agent
      .post('/api/bookings')
      .send({ slotId: slot.id, serviceId: service.id, note: 'Hi' })
      .expect(201);

    expect(res.body.booking).toMatchObject({ status: 'pending', note: 'Hi' });
    const open = await request(app).get('/api/slots').expect(200);
    expect(open.body.slots).toHaveLength(0);
  });

  it('never double-books: two parallel requests, one wins', async () => {
    const [service, slot] = await Promise.all([createService(), createSlot()]);
    const a = await loginAs('user', 'a@test.dev');
    const b = await loginAs('user', 'b@test.dev');
    const body = { slotId: slot.id, serviceId: service.id };

    const results = await Promise.all([
      a.agent.post('/api/bookings').send(body),
      b.agent.post('/api/bookings').send(body),
    ]);

    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await prisma.booking.count()).toBe(1);
  });

  it('cancelling reopens the slot; other users cannot cancel it', async () => {
    const [service, slot] = await Promise.all([createService(), createSlot()]);
    const owner = await loginAs('user', 'owner@test.dev');
    const other = await loginAs('user', 'other@test.dev');
    const { body } = await owner.agent
      .post('/api/bookings')
      .send({ slotId: slot.id, serviceId: service.id })
      .expect(201);

    await other.agent.post(`/api/bookings/${body.booking.id}/cancel`).expect(403);
    await owner.agent.post(`/api/bookings/${body.booking.id}/cancel`).expect(200);

    const reopened = await prisma.slot.findUniqueOrThrow({ where: { id: slot.id } });
    expect(reopened.status).toBe('open');
  });

  it('admin follows valid status transitions only', async () => {
    const [service, slot] = await Promise.all([createService(), createSlot()]);
    const user = await loginAs('user');
    const admin = await loginAs('admin');
    const { body } = await user.agent
      .post('/api/bookings')
      .send({ slotId: slot.id, serviceId: service.id })
      .expect(201);
    const url = `/api/bookings/${body.booking.id}/status`;

    await admin.agent.patch(url).send({ status: 'completed' }).expect(400);
    await admin.agent.patch(url).send({ status: 'confirmed' }).expect(200);
    await admin.agent.patch(url).send({ status: 'completed' }).expect(200);

    const stats = await admin.agent.get('/api/bookings/stats').expect(200);
    expect(stats.body).toMatchObject({ completed: 1, pending: 0, users: 1 });
  });
});

describe('slots', () => {
  it('admin creates slots, overlaps are rejected, booked slots cannot be deleted', async () => {
    const { agent } = await loginAs('admin');
    const startsAt = new Date(Date.now() + 48 * 3_600_000);
    const endsAt = new Date(startsAt.getTime() + 45 * 60_000);

    const { body } = await agent.post('/api/slots').send({ startsAt, endsAt }).expect(201);
    await agent
      .post('/api/slots')
      .send({ startsAt: new Date(startsAt.getTime() + 10 * 60_000), endsAt })
      .expect(409);
    await agent
      .post('/api/slots')
      .send({ startsAt: new Date(Date.now() - 3_600_000), endsAt })
      .expect(400);

    await prisma.slot.update({ where: { id: body.slot.id }, data: { status: 'booked' } });
    await agent.delete(`/api/slots/${body.slot.id}`).expect(409);
  });
});
