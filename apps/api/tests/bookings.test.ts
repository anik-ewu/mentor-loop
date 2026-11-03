import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { env } from '../src/config/env';
import { prisma } from '../src/lib/prisma';
import { MAX_ACTIVE_BOOKINGS } from '../src/modules/bookings/bookings.service';
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

  it('caps upcoming bookings per account, even with parallel requests', async () => {
    const service = await createService();
    const slots = await Promise.all([1, 2, 3, 4, 5, 6].map((h) => createSlot(h * 2)));
    const { agent } = await loginAs('user');

    const results = await Promise.all(
      slots.map((slot) =>
        agent.post('/api/bookings').send({ slotId: slot.id, serviceId: service.id }),
      ),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(MAX_ACTIVE_BOOKINGS);
    expect(results.filter((r) => r.status === 409)).toHaveLength(3);
    const open = await request(app).get('/api/slots').expect(200);
    expect(open.body.slots).toHaveLength(3);
  });

  it('does not reopen a slot when the same booking is cancelled twice at once', async () => {
    const [service, slot] = await Promise.all([createService(), createSlot()]);
    const { agent } = await loginAs('user', 'first@test.dev');
    const { body } = await agent
      .post('/api/bookings')
      .send({ slotId: slot.id, serviceId: service.id })
      .expect(201);

    const cancels = await Promise.all([
      agent.post(`/api/bookings/${body.booking.id}/cancel`),
      agent.post(`/api/bookings/${body.booking.id}/cancel`),
    ]);
    expect(cancels.filter((r) => r.status === 200)).toHaveLength(1);

    // A cancel that lost the race must leave the next person's booking alone.
    const next = await loginAs('user', 'next@test.dev');
    await next.agent
      .post('/api/bookings')
      .send({ slotId: slot.id, serviceId: service.id })
      .expect(201);
    await agent.post(`/api/bookings/${body.booking.id}/cancel`).expect(400);
    const after = await prisma.slot.findUniqueOrThrow({ where: { id: slot.id } });
    expect(after.status).toBe('booked');
  });

  it.each(['javascript:alert(1)', 'data:text/html,hi', 'ftp://example.com/cv.pdf'])(
    'refuses %s as a CV link',
    async (cvUrl) => {
      const [service, slot] = await Promise.all([createService(), createSlot()]);
      const { agent } = await loginAs('user');
      const res = await agent
        .post('/api/bookings')
        .send({ slotId: slot.id, serviceId: service.id, cvUrl })
        .expect(400);
      expect(res.body.error.fields.cvUrl).toBeDefined();
    },
  );

  describe('demo mentor', () => {
    async function setup() {
      const [service, slot] = await Promise.all([createService(), createSlot()]);
      // A real client's booking, which the demo mentor must never see or touch.
      const client = await loginAs('user', 'real.client@example.com');
      const { body } = await client.agent
        .post('/api/bookings')
        .send({ slotId: slot.id, serviceId: service.id, note: 'Private' })
        .expect(201);
      const demo = request.agent(app);
      await demo.post('/api/auth/demo').send({ role: 'admin' }).expect(200);
      return { demo, service, slot, booking: body.booking };
    }

    it('sees no real client data', async () => {
      const { demo } = await setup();
      const list = await demo.get('/api/bookings').expect(200);
      expect(list.body.bookings).toEqual([]);
      const stats = await demo.get('/api/bookings/stats').expect(200);
      expect(stats.body).toMatchObject({ pending: 0, nextBooking: null });
      const slots = await demo.get('/api/slots/all').expect(200);
      expect(JSON.stringify(slots.body)).not.toContain('real.client');
      expect(JSON.stringify(slots.body)).not.toContain('Private');
    });

    it('sees only the demo client in AI usage', async () => {
      const { demo } = await setup();
      const real = await prisma.user.findUniqueOrThrow({
        where: { email: 'real.client@example.com' },
      });
      await prisma.aiRun.create({
        data: { userId: real.id, kind: 'resume_review', input: {}, model: 't', costMicros: 500 },
      });
      const { body } = await demo.get('/api/admin/usage').expect(200);
      expect(body.totals.runs).toBe(0);
      expect(body.month.costUsd).toBe(0);
      expect(body.byDay).toEqual([]);
    });

    it('cannot change anything', async () => {
      const { demo, service, slot, booking } = await setup();
      const body = { startsAt: '2099-01-01T10:00:00Z', endsAt: '2099-01-01T11:00:00Z' };
      await demo.post(`/api/bookings/${booking.id}/cancel`).expect(403);
      await demo
        .patch(`/api/bookings/${booking.id}/status`)
        .send({ status: 'confirmed' })
        .expect(403);
      await demo.post('/api/bookings').send({ slotId: slot.id, serviceId: service.id }).expect(403);
      await demo.post('/api/slots').send(body).expect(403);
      await demo.delete(`/api/slots/${slot.id}`).expect(403);
      await demo.patch(`/api/services/${service.id}`).send({ isActive: false }).expect(403);
      const after = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
      expect(after.status).toBe('pending');
    });

    it('stays restricted even after demo mode is turned off', async () => {
      const { demo, booking } = await setup();
      const previous = env.DEMO_MODE;
      env.DEMO_MODE = false;
      try {
        await demo.post(`/api/bookings/${booking.id}/cancel`).expect(403);
        expect((await demo.get('/api/bookings').expect(200)).body.bookings).toEqual([]);
      } finally {
        env.DEMO_MODE = previous;
      }
    });
  });
});
