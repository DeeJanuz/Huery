/**
 * API routes for codebase search.
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import type { ICodeUnitRepository } from '@/domain/ports/index.js';
import { wrapHandler } from '../route-handler.js';

interface SearchDependencies {
  codeUnitRepo: ICodeUnitRepository;
}

export function createSearchRoutes(deps: SearchDependencies): ReturnType<typeof Router> {
  const router = Router();

  router.get('/search', wrapHandler((req: Request, res: Response) => {
    const query = (req.query.q as string | undefined)?.toLowerCase();
    if (!query) {
      res.status(400).json({ error: 'Query parameter "q" is required' });
      return;
    }

    const searchType = (req.query.type as string) ?? 'code_unit';
    const limit = req.query.limit ? Number(req.query.limit) : 20;

    // NOTE: Search uses findAll + in-memory substring filtering. This is a
    // known scalability limitation. A proper full-text search index (e.g.
    // SQLite FTS5) would be needed for large codebases.
    const allUnits = deps.codeUnitRepo.findAll();
    let results;

    switch (searchType) {
      case 'file':
        results = allUnits.filter((u) =>
          u.filePath.toLowerCase().includes(query),
        );
        break;
      case 'pattern':
        results = allUnits.filter((u) =>
          u.patterns.some((p) =>
            p.patternValue.toLowerCase().includes(query),
          ),
        );
        break;
      case 'code_unit':
      default:
        results = allUnits.filter((u) =>
          u.name.toLowerCase().includes(query),
        );
        break;
    }

    const total = results.length;
    const items = results.slice(0, limit).map((u) => ({
      id: u.id,
      name: u.name,
      unitType: u.unitType,
      filePath: u.filePath,
      lineStart: u.lineStart,
      lineEnd: u.lineEnd,
      language: u.language,
      signature: u.signature,
    }));

    res.json({ total, items });
  }));

  return router;
}
