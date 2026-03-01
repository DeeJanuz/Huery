import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import { createClustersRoutes } from '@/adapters/ui/routes/clusters.js';
import {
  InMemoryFileClusterRepository,
  InMemoryCodeUnitRepository,
  InMemoryFileDependencyRepository,
} from '../../../helpers/fakes/index.js';
import {
  createFileCluster,
  createFileClusterMember,
  createCodeUnit,
  CodeUnitType,
  createFileDependency,
  ImportType,
} from '@/domain/models/index.js';
import { request } from '../test-helpers.js';

describe('clusters routes', () => {
  let fileClusterRepo: InMemoryFileClusterRepository;
  let codeUnitRepo: InMemoryCodeUnitRepository;
  let dependencyRepo: InMemoryFileDependencyRepository;
  let app: ReturnType<typeof express>;

  beforeEach(() => {
    fileClusterRepo = new InMemoryFileClusterRepository();
    codeUnitRepo = new InMemoryCodeUnitRepository();
    dependencyRepo = new InMemoryFileDependencyRepository();

    app = express();
    app.use('/api', createClustersRoutes({ fileClusterRepo, codeUnitRepo, dependencyRepo }));
  });

  describe('GET /api/clusters', () => {
    it('should return all clusters with member counts', async () => {
      const cluster = createFileCluster({
        name: 'auth', cohesion: 0.8, internalEdges: 3, externalEdges: 1,
      });
      const members = [
        createFileClusterMember({ clusterId: cluster.id, filePath: 'src/auth/login.ts', isEntryPoint: true }),
        createFileClusterMember({ clusterId: cluster.id, filePath: 'src/auth/session.ts', isEntryPoint: false }),
      ];
      fileClusterRepo.save(cluster, members);

      const resp = await request(app, '/api/clusters');
      const body = resp.body as Array<Record<string, unknown>>;

      expect(resp.status).toBe(200);
      expect(body).toHaveLength(1);
      expect(body[0]).toEqual({
        id: cluster.id,
        name: 'auth',
        cohesion: 0.8,
        internalEdges: 3,
        externalEdges: 1,
        memberCount: 2,
      });
    });

    it('should return empty array for empty repo', async () => {
      const resp = await request(app, '/api/clusters');
      expect(resp.body).toEqual([]);
    });
  });

  describe('GET /api/clusters/:id', () => {
    it('should return full cluster detail with code units and classified deps', async () => {
      const cluster = createFileCluster({
        id: 'cluster-1',
        name: 'auth', cohesion: 0.8, internalEdges: 2, externalEdges: 1,
      });
      const members = [
        createFileClusterMember({ clusterId: cluster.id, filePath: 'src/auth/login.ts', isEntryPoint: true }),
        createFileClusterMember({ clusterId: cluster.id, filePath: 'src/auth/session.ts', isEntryPoint: false }),
      ];
      fileClusterRepo.save(cluster, members);

      // Code units in the cluster files
      codeUnitRepo.save(createCodeUnit({
        filePath: 'src/auth/login.ts', name: 'login', unitType: CodeUnitType.FUNCTION,
        lineStart: 1, lineEnd: 20, isAsync: true, isExported: true, language: 'typescript',
      }));

      // Internal dependency
      dependencyRepo.save(createFileDependency({
        sourceFile: 'src/auth/login.ts', targetFile: 'src/auth/session.ts', importType: ImportType.NAMED,
      }));
      // External dependency
      dependencyRepo.save(createFileDependency({
        sourceFile: 'src/auth/login.ts', targetFile: 'src/db/pool.ts', importType: ImportType.NAMED,
      }));

      const resp = await request(app, '/api/clusters/cluster-1');
      const body = resp.body as Record<string, unknown>;

      expect(resp.status).toBe(200);
      expect((body.cluster as Record<string, unknown>).name).toBe('auth');
      expect((body.cluster as Record<string, unknown>).files).toEqual([
        'src/auth/login.ts', 'src/auth/session.ts',
      ]);
      expect((body.cluster as Record<string, unknown>).entryPoints).toEqual([
        'src/auth/login.ts',
      ]);
      expect((body.codeUnits as unknown[])).toHaveLength(1);
      expect((body.internalDeps as unknown[])).toHaveLength(1);
      expect((body.externalDeps as unknown[])).toHaveLength(1);
    });

    it('should return 404 for missing cluster', async () => {
      const resp = await request(app, '/api/clusters/nonexistent');

      expect(resp.status).toBe(404);
      expect(resp.body).toEqual({ error: 'Cluster not found' });
    });

    it('should include members in cluster detail', async () => {
      const cluster = createFileCluster({
        id: 'c1', name: 'core', cohesion: 0.9, internalEdges: 5, externalEdges: 0,
      });
      const members = [
        createFileClusterMember({ clusterId: cluster.id, filePath: 'src/core/index.ts', isEntryPoint: true }),
      ];
      fileClusterRepo.save(cluster, members);

      const resp = await request(app, '/api/clusters/c1');
      const body = resp.body as Record<string, unknown>;

      expect((body.members as Array<Record<string, unknown>>)).toHaveLength(1);
      expect((body.members as Array<Record<string, unknown>>)[0].filePath).toBe('src/core/index.ts');
    });
  });
});
