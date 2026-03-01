/**
 * API routes for file dependencies.
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import type { IFileDependencyRepository } from '@/domain/ports/index.js';
import type { FileDependency } from '@/domain/models/index.js';

interface DependenciesDeps {
  dependencyRepo: IFileDependencyRepository;
}

export function createDependenciesRoutes(deps: DependenciesDeps): ReturnType<typeof Router> {
  const router = Router();

  router.get('/dependencies', (req: Request, res: Response) => {
    try {
      const source = req.query.source as string | undefined;
      const target = req.query.target as string | undefined;
      const limit = req.query.limit ? Number(req.query.limit) : undefined;

      let results: FileDependency[];

      if (source) {
        results = deps.dependencyRepo.findBySourceFile(source);
        if (target) {
          results = results.filter((d) => d.targetFile === target);
        }
      } else if (target) {
        results = deps.dependencyRepo.findByTargetFile(target);
      } else {
        results = deps.dependencyRepo.findAll();
      }

      if (limit !== undefined) {
        results = results.slice(0, limit);
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
