import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import { createEventFlowsRoutes } from '@/adapters/ui/routes/event-flows.js';
import { InMemoryEventFlowRepository } from '../../../helpers/fakes/index.js';
import { createEventFlow } from '@/domain/models/index.js';
import { request } from '../test-helpers.js';

describe('GET /api/event-flows', () => {
  let eventFlowRepo: InMemoryEventFlowRepository;
  let app: ReturnType<typeof express>;

  beforeEach(() => {
    eventFlowRepo = new InMemoryEventFlowRepository();
    app = express();
    app.use('/api', createEventFlowsRoutes({ eventFlowRepo }));
  });

  it('should return all event flows when no filters are given', async () => {
    eventFlowRepo.save(createEventFlow({
      codeUnitId: 'u1', eventName: 'user.created', direction: 'emit', framework: 'EventEmitter', lineNumber: 5,
    }));
    eventFlowRepo.save(createEventFlow({
      codeUnitId: 'u2', eventName: 'user.updated', direction: 'subscribe', framework: 'EventEmitter', lineNumber: 10,
    }));

    const resp = await request(app, '/api/event-flows');
    const body = resp.body as unknown[];

    expect(resp.status).toBe(200);
    expect(body).toHaveLength(2);
  });

  it('should filter by event_name', async () => {
    eventFlowRepo.save(createEventFlow({
      codeUnitId: 'u1', eventName: 'user.created', direction: 'emit', framework: 'EventEmitter', lineNumber: 5,
    }));
    eventFlowRepo.save(createEventFlow({
      codeUnitId: 'u2', eventName: 'order.placed', direction: 'emit', framework: 'EventEmitter', lineNumber: 10,
    }));

    const resp = await request(app, '/api/event-flows?event_name=user.created');
    const body = resp.body as Array<{ eventName: string }>;

    expect(body).toHaveLength(1);
    expect(body[0].eventName).toBe('user.created');
  });

  it('should filter by code_unit_id', async () => {
    eventFlowRepo.save(createEventFlow({
      codeUnitId: 'u1', eventName: 'user.created', direction: 'emit', framework: 'EventEmitter', lineNumber: 5,
    }));
    eventFlowRepo.save(createEventFlow({
      codeUnitId: 'u2', eventName: 'order.placed', direction: 'emit', framework: 'EventEmitter', lineNumber: 10,
    }));

    const resp = await request(app, '/api/event-flows?code_unit_id=u1');
    const body = resp.body as Array<{ codeUnitId: string }>;

    expect(body).toHaveLength(1);
    expect(body[0].codeUnitId).toBe('u1');
  });

  it('should filter by both code_unit_id and event_name', async () => {
    eventFlowRepo.save(createEventFlow({
      codeUnitId: 'u1', eventName: 'user.created', direction: 'emit', framework: 'EventEmitter', lineNumber: 5,
    }));
    eventFlowRepo.save(createEventFlow({
      codeUnitId: 'u1', eventName: 'user.updated', direction: 'emit', framework: 'EventEmitter', lineNumber: 10,
    }));
    eventFlowRepo.save(createEventFlow({
      codeUnitId: 'u2', eventName: 'user.created', direction: 'subscribe', framework: 'EventEmitter', lineNumber: 15,
    }));

    const resp = await request(app, '/api/event-flows?code_unit_id=u1&event_name=user.created');
    const body = resp.body as Array<{ codeUnitId: string; eventName: string }>;

    expect(body).toHaveLength(1);
    expect(body[0].codeUnitId).toBe('u1');
    expect(body[0].eventName).toBe('user.created');
  });

  it('should return empty array for empty repo', async () => {
    const resp = await request(app, '/api/event-flows');
    expect(resp.body).toEqual([]);
  });
});
