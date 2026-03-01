/**
 * API routes for code units.
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import type {
  ICodeUnitRepository,
  IFileSystem,
  IFunctionCallRepository,
  ITypeFieldRepository,
} from '@/domain/ports/index.js';
import type { CodeUnit, CodeUnitType } from '@/domain/models/index.js';
import { extractSourceForUnit } from '@/adapters/mcp/source-extractor.js';
import { wrapHandler } from '../route-handler.js';

interface CodeUnitsDependencies {
  codeUnitRepo: ICodeUnitRepository;
  functionCallRepo: IFunctionCallRepository;
  typeFieldRepo: ITypeFieldRepository;
  fileSystem: IFileSystem;
}

export function createCodeUnitsRoutes(deps: CodeUnitsDependencies): ReturnType<typeof Router> {
  const router = Router();

  router.get('/code-units', wrapHandler((req: Request, res: Response) => {
    const filePath = req.query.file_path as string | undefined;
    const unitType = req.query.type as string | undefined;
    const language = req.query.language as string | undefined;
    const exported = req.query.exported as string | undefined;
    const minComplexity = req.query.min_complexity as string | undefined;
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const offset = req.query.offset ? Number(req.query.offset) : 0;

    // Use targeted repository methods when a single filter is provided,
    // falling back to findAll only when no filters are given.
    let units: CodeUnit[];

    if (filePath) {
      units = deps.codeUnitRepo.findByFilePath(filePath);
    } else if (unitType) {
      units = deps.codeUnitRepo.findByType(unitType as CodeUnitType);
    } else if (language) {
      units = deps.codeUnitRepo.findByLanguage(language);
    } else {
      units = deps.codeUnitRepo.findAll();
    }

    // Apply remaining in-memory filters that weren't handled by the repo query
    if (filePath && unitType) {
      units = units.filter((u) => u.unitType === (unitType as CodeUnitType));
    }
    if (filePath && language) {
      units = units.filter((u) => u.language === language);
    }
    if (unitType && language && !filePath) {
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
  }));

  router.get('/code-units/:id', wrapHandler(async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const unit = deps.codeUnitRepo.findById(id);
    if (!unit) {
      res.status(404).json({ error: 'Code unit not found' });
      return;
    }

    const callers = deps.functionCallRepo.findByCalleeUnitId(unit.id);
    const callees = deps.functionCallRepo.findByCallerUnitId(unit.id);
    const typeFields = deps.typeFieldRepo.findByParentUnitId(unit.id);
    const extractedCode = await extractSourceForUnit(deps.fileSystem, {
      filePath: unit.filePath,
      lineStart: unit.lineStart,
      lineEnd: unit.lineEnd,
    });

    res.json({
      ...unit,
      functionCalls: { callers, callees },
      typeFields,
      extractedCode,
    });
  }));

  return router;
}
