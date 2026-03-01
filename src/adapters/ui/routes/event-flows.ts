/**
 * API routes for event flows.
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import type { IEventFlowRepository } from '@/domain/ports/index.js';
import type { EventFlow } from '@/domain/models/index.js';
import { wrapHandler } from '../route-handler.js';

interface EventFlowsDependencies {
  eventFlowRepo: IEventFlowRepository;
}

export function createEventFlowsRoutes(deps: EventFlowsDependencies): ReturnType<typeof Router> {
  const router = Router();

  router.get('/event-flows', wrapHandler((req: Request, res: Response) => {
    const eventName = req.query.event_name as string | undefined;
    const codeUnitId = req.query.code_unit_id as string | undefined;

    let results: EventFlow[];

    if (codeUnitId) {
      results = deps.eventFlowRepo.findByCodeUnitId(codeUnitId);
      if (eventName) {
        results = results.filter((f) => f.eventName === eventName);
      }
    } else if (eventName) {
      results = deps.eventFlowRepo.findByEventName(eventName);
    } else {
      results = deps.eventFlowRepo.findAll();
    }

    res.json(results);
  }));

  return router;
}
