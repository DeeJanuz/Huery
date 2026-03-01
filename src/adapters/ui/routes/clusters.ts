/**
 * API routes for file clusters (feature areas).
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import type {
  IFileClusterRepository,
  ICodeUnitRepository,
  IFileDependencyRepository,
} from '@/domain/ports/index.js';

interface ClustersDependencies {
  fileClusterRepo: IFileClusterRepository;
  codeUnitRepo: ICodeUnitRepository;
  dependencyRepo: IFileDependencyRepository;
}

export function createClustersRoutes(deps: ClustersDependencies): ReturnType<typeof Router> {
  const router = Router();

  router.get('/clusters', (_req: Request, res: Response) => {
    try {
      const allClusters = deps.fileClusterRepo.findAll();

      const items = allClusters.map(({ cluster, members }) => ({
        id: cluster.id,
        name: cluster.name,
        cohesion: cluster.cohesion,
        internalEdges: cluster.internalEdges,
        externalEdges: cluster.externalEdges,
        memberCount: members.length,
      }));

      res.json(items);
    } catch (error) {
      res
        .status(500)
        .json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  router.get('/clusters/:id', (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      const result = deps.fileClusterRepo.findById(id);
      if (!result) {
        res.status(404).json({ error: 'Cluster not found' });
        return;
      }

      const { cluster, members } = result;
      const clusterFilePaths = members.map((m) => m.filePath);
      const clusterFileSet = new Set(clusterFilePaths);

      // Gather code units
      const codeUnits = [];
      for (const fp of clusterFilePaths) {
        const units = deps.codeUnitRepo.findByFilePath(fp);
        for (const unit of units) {
          codeUnits.push({
            id: unit.id,
            name: unit.name,
            filePath: unit.filePath,
            unitType: unit.unitType,
            lineStart: unit.lineStart,
            lineEnd: unit.lineEnd,
            signature: unit.signature,
            complexity: unit.complexityScore > 0 ? unit.complexityScore : undefined,
            patterns: unit.patterns.map((p) => ({
              patternType: p.patternType,
              patternValue: p.patternValue,
            })),
          });
        }
      }

      // Classify dependencies
      const internalDeps: Array<{ source: string; target: string }> = [];
      const externalDeps: Array<{
        source: string;
        target: string;
        direction: 'inbound' | 'outbound';
      }> = [];
      const seen = new Set<string>();

      for (const fp of clusterFilePaths) {
        const outgoing = deps.dependencyRepo.findBySourceFile(fp);
        for (const dep of outgoing) {
          const key = `${dep.sourceFile}->${dep.targetFile}`;
          if (seen.has(key)) continue;
          seen.add(key);

          if (clusterFileSet.has(dep.targetFile)) {
            internalDeps.push({ source: dep.sourceFile, target: dep.targetFile });
          } else {
            externalDeps.push({
              source: dep.sourceFile,
              target: dep.targetFile,
              direction: 'outbound',
            });
          }
        }

        const incoming = deps.dependencyRepo.findByTargetFile(fp);
        for (const dep of incoming) {
          const key = `${dep.sourceFile}->${dep.targetFile}`;
          if (seen.has(key)) continue;
          seen.add(key);

          if (!clusterFileSet.has(dep.sourceFile)) {
            externalDeps.push({
              source: dep.sourceFile,
              target: dep.targetFile,
              direction: 'inbound',
            });
          }
        }
      }

      res.json({
        cluster: {
          id: cluster.id,
          name: cluster.name,
          cohesion: cluster.cohesion,
          internalEdges: cluster.internalEdges,
          externalEdges: cluster.externalEdges,
          files: clusterFilePaths,
          entryPoints: members.filter((m) => m.isEntryPoint).map((m) => m.filePath),
        },
        members,
        codeUnits,
        internalDeps,
        externalDeps,
      });
    } catch (error) {
      res
        .status(500)
        .json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  return router;
}
