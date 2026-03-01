/**
 * API routes for function calls.
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import type { IFunctionCallRepository } from '@/domain/ports/index.js';
import type { FunctionCall } from '@/domain/models/index.js';

interface FunctionCallsDependencies {
  functionCallRepo: IFunctionCallRepository;
}

export function createFunctionCallsRoutes(
  deps: FunctionCallsDependencies,
): ReturnType<typeof Router> {
  const router = Router();

  router.get('/function-calls', (req: Request, res: Response) => {
    try {
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
    } catch (error) {
      res
        .status(500)
        .json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  return router;
}
