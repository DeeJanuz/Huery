/**
 * API routes for codebase search.
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import type { ICodeUnitRepository } from '@/domain/ports/index.js';

interface SearchDependencies {
  codeUnitRepo: ICodeUnitRepository;
}

export function createSearchRoutes(deps: SearchDependencies): ReturnType<typeof Router> {
  const router = Router();

  router.get('/search', (req: Request, res: Response) => {
    try {
      const query = (req.query.q as string | undefined)?.toLowerCase();
      if (!query) {
        res.status(400).json({ error: 'Query parameter "q" is required' });
        return;
      }

      const searchType = (req.query.type as string) ?? 'code_unit';
      const limit = req.query.limit ? Number(req.query.limit) : 20;

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
    } catch (error) {
      res
        .status(500)
        .json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  return router;
}
