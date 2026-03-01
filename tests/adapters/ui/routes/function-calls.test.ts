import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import { createFunctionCallsRoutes } from '@/adapters/ui/routes/function-calls.js';
import { InMemoryFunctionCallRepository } from '../../../helpers/fakes/index.js';
import { createFunctionCall } from '@/domain/models/index.js';
import { request } from '../test-helpers.js';

describe('GET /api/function-calls', () => {
  let functionCallRepo: InMemoryFunctionCallRepository;
  let app: ReturnType<typeof express>;

  beforeEach(() => {
    functionCallRepo = new InMemoryFunctionCallRepository();
    app = express();
    app.use('/api', createFunctionCallsRoutes({ functionCallRepo }));
  });

  it('should return all function calls when no filters are given', async () => {
    functionCallRepo.save(createFunctionCall({
      callerUnitId: 'u1', calleeName: 'helper', lineNumber: 5, isAsync: false,
    }));
    functionCallRepo.save(createFunctionCall({
      callerUnitId: 'u2', calleeName: 'other', lineNumber: 10, isAsync: true,
    }));

    const resp = await request(app, '/api/function-calls');
    const body = resp.body as unknown[];

    expect(resp.status).toBe(200);
    expect(body).toHaveLength(2);
  });

  it('should filter by caller_id', async () => {
    functionCallRepo.save(createFunctionCall({
      callerUnitId: 'u1', calleeName: 'helper', lineNumber: 5, isAsync: false,
    }));
    functionCallRepo.save(createFunctionCall({
      callerUnitId: 'u2', calleeName: 'other', lineNumber: 10, isAsync: false,
    }));

    const resp = await request(app, '/api/function-calls?caller_id=u1');
    const body = resp.body as Array<{ callerUnitId: string }>;

    expect(body).toHaveLength(1);
    expect(body[0].callerUnitId).toBe('u1');
  });

  it('should filter by callee_id', async () => {
    functionCallRepo.save(createFunctionCall({
      callerUnitId: 'u1', calleeName: 'helper', calleeUnitId: 'u3', lineNumber: 5, isAsync: false,
    }));
    functionCallRepo.save(createFunctionCall({
      callerUnitId: 'u2', calleeName: 'other', calleeUnitId: 'u4', lineNumber: 10, isAsync: false,
    }));

    const resp = await request(app, '/api/function-calls?callee_id=u3');
    const body = resp.body as Array<{ calleeUnitId: string }>;

    expect(body).toHaveLength(1);
    expect(body[0].calleeUnitId).toBe('u3');
  });

  it('should filter by both caller_id and callee_id', async () => {
    functionCallRepo.save(createFunctionCall({
      callerUnitId: 'u1', calleeName: 'helper', calleeUnitId: 'u3', lineNumber: 5, isAsync: false,
    }));
    functionCallRepo.save(createFunctionCall({
      callerUnitId: 'u1', calleeName: 'other', calleeUnitId: 'u4', lineNumber: 10, isAsync: false,
    }));
    functionCallRepo.save(createFunctionCall({
      callerUnitId: 'u2', calleeName: 'helper', calleeUnitId: 'u3', lineNumber: 15, isAsync: false,
    }));

    const resp = await request(app, '/api/function-calls?caller_id=u1&callee_id=u3');
    const body = resp.body as Array<{ callerUnitId: string; calleeUnitId: string }>;

    expect(body).toHaveLength(1);
    expect(body[0].callerUnitId).toBe('u1');
    expect(body[0].calleeUnitId).toBe('u3');
  });

  it('should return empty array for empty repo', async () => {
    const resp = await request(app, '/api/function-calls');
    expect(resp.body).toEqual([]);
  });
});
