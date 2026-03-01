/**
 * API routes for code units.
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import type {
  ICodeUnitRepository,
  IFunctionCallRepository,
  ITypeFieldRepository,
} from '@/domain/ports/index.js';
import type { CodeUnit, CodeUnitType } from '@/domain/models/index.js';

interface CodeUnitsDependencies {
  codeUnitRepo: ICodeUnitRepository;
  functionCallRepo: IFunctionCallRepository;
  typeFieldRepo: ITypeFieldRepository;
}

export function createCodeUnitsRoutes(deps: CodeUnitsDependencies): ReturnType<typeof Router> {
  const router = Router();

  router.get('/code-units', (req: Request, res: Response) => {
    try {
      let units: CodeUnit[] = deps.codeUnitRepo.findAll();

      const filePath = req.query.file_path as string | undefined;
      const unitType = req.query.type as string | undefined;
      const language = req.query.language as string | undefined;
      const exported = req.query.exported as string | undefined;
      const minComplexity = req.query.min_complexity as string | undefined;
      const limit = req.query.limit ? Number(req.query.limit) : undefined;
      const offset = req.query.offset ? Number(req.query.offset) : 0;

      if (filePath) {
        units = units.filter((u) => u.filePath === filePath);
      }
      if (unitType) {
        units = units.filter((u) => u.unitType === (unitType as CodeUnitType));
      }
      if (language) {
        units = units.filter((u) => u.language === language);
      }
      if (exported !== undefined) {
        const isExported = exported === 'true';
        units = units.filter((u) => u.isExported === isExported);
      }
      if (minComplexity !== undefined) {
        const threshold = Number(minComplexity);
        units = units.filter((u) => u.complexityScore >= threshold);
      }

      const total = units.length;
      units = units.slice(offset);
      if (limit !== undefined) {
        units = units.slice(0, limit);
      }

      res.json({ total, items: units });
    } catch (error) {
      res
        .status(500)
        .json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  router.get('/code-units/:id', (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      const unit = deps.codeUnitRepo.findById(id);
      if (!unit) {
        res.status(404).json({ error: 'Code unit not found' });
        return;
      }

      const callers = deps.functionCallRepo.findByCalleeUnitId(unit.id);
      const callees = deps.functionCallRepo.findByCallerUnitId(unit.id);
      const typeFields = deps.typeFieldRepo.findByParentUnitId(unit.id);

      res.json({
        ...unit,
        functionCalls: { callers, callees },
        typeFields,
      });
    } catch (error) {
      res
        .status(500)
        .json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  return router;
}
