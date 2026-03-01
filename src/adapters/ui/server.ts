/**
 * Express app factory for the Heury UI viewer.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import type { Express, Request, Response } from 'express';
import type {
  ICodeUnitRepository,
  IFileDependencyRepository,
  IEnvVariableRepository,
  IFileSystem,
  IFunctionCallRepository,
  ITypeFieldRepository,
  IEventFlowRepository,
  IFileClusterRepository,
} from '@/domain/ports/index.js';
import { createStatsRoutes } from './routes/stats.js';
import { createCodeUnitsRoutes } from './routes/code-units.js';
import { createSearchRoutes } from './routes/search.js';
import { createDependenciesRoutes } from './routes/dependencies.js';
import { createClustersRoutes } from './routes/clusters.js';
import { createFunctionCallsRoutes } from './routes/function-calls.js';
import { createEventFlowsRoutes } from './routes/event-flows.js';

export interface UiServerDependencies {
  codeUnitRepo: ICodeUnitRepository;
  dependencyRepo: IFileDependencyRepository;
  envVarRepo: IEnvVariableRepository;
  fileSystem: IFileSystem;
  functionCallRepo: IFunctionCallRepository;
  typeFieldRepo: ITypeFieldRepository;
  eventFlowRepo: IEventFlowRepository;
  fileClusterRepo: IFileClusterRepository;
}

export interface UiServer {
  readonly app: Express;
  start(port: number, host?: string): Promise<void>;
}

export function createUiServer(deps: UiServerDependencies): UiServer {
  const app = express();

  // JSON parsing
  app.use(express.json());

  // API routes
  app.use('/api', createStatsRoutes(deps));
  app.use('/api', createCodeUnitsRoutes(deps));
  app.use('/api', createSearchRoutes(deps));
  app.use('/api', createDependenciesRoutes(deps));
  app.use('/api', createClustersRoutes(deps));
  app.use('/api', createFunctionCallsRoutes(deps));
  app.use('/api', createEventFlowsRoutes(deps));

  // Static files for the built client
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const clientPath = path.join(__dirname, '../ui/client');
  app.use(express.static(clientPath));

  // SPA fallback: any non-API route serves index.html
  app.get('{*path}', (_req: Request, res: Response) => {
    res.sendFile(path.join(clientPath, 'index.html'));
  });

  return {
    app,
    start(port: number, host = 'localhost'): Promise<void> {
      return new Promise((resolve, reject) => {
        const server = app.listen(port, host, () => {
          resolve();
        });
        server.on('error', reject);
      });
    },
  };
}
