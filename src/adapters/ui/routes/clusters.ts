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
import { wrapHandler } from '../route-handler.js';
import { collectClusterCodeUnits, classifyClusterDependencies, computeInterClusterEdges } from '../cluster-detail.js';

interface ClustersDependencies {
  fileClusterRepo: IFileClusterRepository;
  codeUnitRepo: ICodeUnitRepository;
  dependencyRepo: IFileDependencyRepository;
}

export function createClustersRoutes(deps: ClustersDependencies): ReturnType<typeof Router> {
  const router = Router();

  router.get('/clusters', wrapHandler((_req: Request, res: Response) => {
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
  }));

  router.get('/clusters/relationships', wrapHandler((_req: Request, res: Response) => {
    const edges = computeInterClusterEdges(deps.fileClusterRepo, deps.dependencyRepo);
    res.json({ edges });
  }));

  router.get('/clusters/:id', wrapHandler((req: Request, res: Response) => {
    const id = String(req.params.id);
    const result = deps.fileClusterRepo.findById(id);
    if (!result) {
      res.status(404).json({ error: 'Cluster not found' });
      return;
    }

    const { cluster, members } = result;
    const clusterFilePaths = members.map((m) => m.filePath);
    const clusterFileSet = new Set(clusterFilePaths);

    const codeUnits = collectClusterCodeUnits(deps.codeUnitRepo, clusterFilePaths);
    const { internalDeps, externalDeps } = classifyClusterDependencies(
      deps.dependencyRepo,
      clusterFilePaths,
      clusterFileSet,
    );

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
  }));

  return router;
}
