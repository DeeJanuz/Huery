/**
 * API routes for file dependencies.
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import type { IFileDependencyRepository } from '@/domain/ports/index.js';
import type { FileDependency } from '@/domain/models/index.js';
import { wrapHandler } from '../route-handler.js';

interface DependenciesDeps {
  dependencyRepo: IFileDependencyRepository;
}

export function createDependenciesRoutes(deps: DependenciesDeps): ReturnType<typeof Router> {
  const router = Router();

  router.get('/dependencies', wrapHandler((req: Request, res: Response) => {
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
  }));

  return router;
}
