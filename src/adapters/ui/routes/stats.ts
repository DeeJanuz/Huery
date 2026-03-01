/**
 * API routes for analysis stats.
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import type {
  ICodeUnitRepository,
  IFileDependencyRepository,
  IEnvVariableRepository,
  IFileClusterRepository,
} from '@/domain/ports/index.js';

interface StatsDependencies {
  codeUnitRepo: ICodeUnitRepository;
  dependencyRepo: IFileDependencyRepository;
  envVarRepo: IEnvVariableRepository;
  fileClusterRepo: IFileClusterRepository;
}

export function createStatsRoutes(deps: StatsDependencies): ReturnType<typeof Router> {
  const router = Router();

  router.get('/stats', (_req: Request, res: Response) => {
    try {
      const allUnits = deps.codeUnitRepo.findAll();
      const allDeps = deps.dependencyRepo.findAll();
      const allEnvVars = deps.envVarRepo.findAll();
      const allClusters = deps.fileClusterRepo.findAll();

      const files = new Set(allUnits.map((u) => u.filePath));

      const languages: Record<string, number> = {};
      for (const unit of allUnits) {
        languages[unit.language] = (languages[unit.language] ?? 0) + 1;
      }

      const patternCount = allUnits.reduce(
        (sum, u) => sum + u.patterns.length,
        0,
      );

      res.json({
        total_code_units: allUnits.length,
        total_files: files.size,
        total_patterns: patternCount,
        total_dependencies: allDeps.length,
        total_env_variables: allEnvVars.length,
        languages,
        total_clusters: allClusters.length,
      });
    } catch (error) {
      res
        .status(500)
        .json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  return router;
}
