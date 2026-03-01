import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import { createDependenciesRoutes } from '@/adapters/ui/routes/dependencies.js';
import { InMemoryFileDependencyRepository } from '../../../helpers/fakes/index.js';
import { createFileDependency, ImportType } from '@/domain/models/index.js';
import { request } from '../test-helpers.js';

describe('GET /api/dependencies', () => {
  let dependencyRepo: InMemoryFileDependencyRepository;
  let app: ReturnType<typeof express>;

  beforeEach(() => {
    dependencyRepo = new InMemoryFileDependencyRepository();
    app = express();
    app.use('/api', createDependenciesRoutes({ dependencyRepo }));
  });

  it('should return all dependencies when no filters are given', async () => {
    dependencyRepo.save(createFileDependency({
      sourceFile: 'src/a.ts', targetFile: 'src/b.ts', importType: ImportType.NAMED,
    }));
    dependencyRepo.save(createFileDependency({
      sourceFile: 'src/b.ts', targetFile: 'src/c.ts', importType: ImportType.DEFAULT,
    }));

    const resp = await request(app, '/api/dependencies');
    const body = resp.body as unknown[];

    expect(resp.status).toBe(200);
    expect(body).toHaveLength(2);
  });

  it('should filter by source', async () => {
    dependencyRepo.save(createFileDependency({
      sourceFile: 'src/a.ts', targetFile: 'src/b.ts', importType: ImportType.NAMED,
    }));
    dependencyRepo.save(createFileDependency({
      sourceFile: 'src/c.ts', targetFile: 'src/d.ts', importType: ImportType.NAMED,
    }));

    const resp = await request(app, '/api/dependencies?source=src/a.ts');
    const body = resp.body as Array<{ sourceFile: string }>;

    expect(body).toHaveLength(1);
    expect(body[0].sourceFile).toBe('src/a.ts');
  });

  it('should filter by target', async () => {
    dependencyRepo.save(createFileDependency({
      sourceFile: 'src/a.ts', targetFile: 'src/b.ts', importType: ImportType.NAMED,
    }));
    dependencyRepo.save(createFileDependency({
      sourceFile: 'src/c.ts', targetFile: 'src/d.ts', importType: ImportType.NAMED,
    }));

    const resp = await request(app, '/api/dependencies?target=src/b.ts');
    const body = resp.body as Array<{ targetFile: string }>;

    expect(body).toHaveLength(1);
    expect(body[0].targetFile).toBe('src/b.ts');
  });

  it('should filter by both source and target', async () => {
    dependencyRepo.save(createFileDependency({
      sourceFile: 'src/a.ts', targetFile: 'src/b.ts', importType: ImportType.NAMED,
    }));
    dependencyRepo.save(createFileDependency({
      sourceFile: 'src/a.ts', targetFile: 'src/c.ts', importType: ImportType.DEFAULT,
    }));
    dependencyRepo.save(createFileDependency({
      sourceFile: 'src/d.ts', targetFile: 'src/b.ts', importType: ImportType.NAMED,
    }));

    const resp = await request(app, '/api/dependencies?source=src/a.ts&target=src/b.ts');
    const body = resp.body as Array<{ sourceFile: string; targetFile: string }>;

    expect(body).toHaveLength(1);
    expect(body[0].sourceFile).toBe('src/a.ts');
    expect(body[0].targetFile).toBe('src/b.ts');
  });

  it('should respect limit parameter', async () => {
    for (let i = 0; i < 5; i++) {
      dependencyRepo.save(createFileDependency({
        sourceFile: `src/${i}.ts`, targetFile: `src/${i + 1}.ts`, importType: ImportType.NAMED,
      }));
    }

    const resp = await request(app, '/api/dependencies?limit=2');
    const body = resp.body as unknown[];

    expect(body).toHaveLength(2);
  });

  it('should return empty array for empty repo', async () => {
    const resp = await request(app, '/api/dependencies');
    const body = resp.body as unknown[];

    expect(body).toEqual([]);
  });
});
