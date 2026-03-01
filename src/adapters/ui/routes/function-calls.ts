/**
 * API routes for function calls.
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import type { IFunctionCallRepository } from '@/domain/ports/index.js';
import type { FunctionCall } from '@/domain/models/index.js';
import { wrapHandler } from '../route-handler.js';

interface FunctionCallsDependencies {
  functionCallRepo: IFunctionCallRepository;
}

export function createFunctionCallsRoutes(
  deps: FunctionCallsDependencies,
): ReturnType<typeof Router> {
  const router = Router();

  router.get('/function-calls', wrapHandler((req: Request, res: Response) => {
    const callerId = req.query.caller_id as string | undefined;
    const calleeId = req.query.callee_id as string | undefined;

    let results: FunctionCall[];

    if (callerId) {
      results = deps.functionCallRepo.findByCallerUnitId(callerId);
      if (calleeId) {
        results = results.filter((c) => c.calleeUnitId === calleeId);
      }
    } else if (calleeId) {
      results = deps.functionCallRepo.findByCalleeUnitId(calleeId);
    } else {
      results = deps.functionCallRepo.findAll();
    }

    res.json(results);
  }));

  return router;
}
