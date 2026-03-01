import { describe, it, expect } from 'vitest';
import express from 'express';
import { wrapHandler } from '@/adapters/ui/route-handler.js';
import { request } from './test-helpers.js';

describe('wrapHandler', () => {
  it('should pass through successful responses', async () => {
    const app = express();
    app.get('/test', wrapHandler((_req, res) => {
      res.json({ ok: true });
    }));

    const resp = await request(app, '/test');

    expect(resp.status).toBe(200);
    expect(resp.body).toEqual({ ok: true });
  });

  it('should catch Error instances and return 500 with message', async () => {
    const app = express();
    app.get('/test', wrapHandler(() => {
      throw new Error('Something broke');
    }));

    const resp = await request(app, '/test');

    expect(resp.status).toBe(500);
    expect(resp.body).toEqual({ error: 'Something broke' });
  });

  it('should catch non-Error throws and stringify them', async () => {
    const app = express();
    app.get('/test', wrapHandler(() => {
      throw 'a string error'; // eslint-disable-line no-throw-literal
    }));

    const resp = await request(app, '/test');

    expect(resp.status).toBe(500);
    expect(resp.body).toEqual({ error: 'a string error' });
  });

  it('should preserve custom status codes set before error', async () => {
    const app = express();
    app.get('/test', wrapHandler((_req, res) => {
      res.status(201).json({ created: true });
    }));

    const resp = await request(app, '/test');

    expect(resp.status).toBe(201);
    expect(resp.body).toEqual({ created: true });
  });
});
