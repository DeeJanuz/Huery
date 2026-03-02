/**
 * CLI ui command - starts the UI viewer server.
 */

import path from 'node:path';
import type { IFileSystem } from '@/domain/ports/index.js';
import { NodeFileSystem } from '@/adapters/filesystem/node-filesystem.js';
import { createCompositionRoot } from '@/composition-root.js';
import { createUiServer } from '@/adapters/ui/server.js';
import { killProcessOnPort } from '@/cli/utils/port-manager.js';

export async function uiCommand(
  options: { dir: string; port: string; host: string },
  fileSystem?: IFileSystem,
): Promise<void> {
  const projectDir = path.resolve(options.dir);
  const fs = fileSystem ?? new NodeFileSystem(projectDir);
  const port = Number(options.port);

  try {
    await killProcessOnPort(port);

    const { dependencies } = await createCompositionRoot(fs, {
      dbPath: `${projectDir}/.heury/heury.db`,
    });

    if (
      !dependencies.functionCallRepo ||
      !dependencies.typeFieldRepo ||
      !dependencies.eventFlowRepo ||
      !dependencies.fileClusterRepo
    ) {
      console.error('Error: Required repositories not available. Run heury analyze first.');
      process.exitCode = 1;
      return;
    }

    const server = createUiServer({
      codeUnitRepo: dependencies.codeUnitRepo,
      dependencyRepo: dependencies.dependencyRepo,
      envVarRepo: dependencies.envVarRepo,
      fileSystem: fs,
      functionCallRepo: dependencies.functionCallRepo,
      typeFieldRepo: dependencies.typeFieldRepo,
      eventFlowRepo: dependencies.eventFlowRepo,
      fileClusterRepo: dependencies.fileClusterRepo,
      projectDir,
    });

    await server.start(port, options.host);
    const displayHost = options.host === '0.0.0.0' ? 'localhost' : options.host;
    console.log(`Heury UI available at http://${displayHost}:${port}`);
    console.log('Press Ctrl+C to stop');

    // Keep the process alive
    setInterval(() => {}, 1 << 30);
  } catch (error) {
    if (error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'EADDRINUSE') {
      console.error(`Error: Port ${port} is already in use. Try: heury ui -p ${port + 1}`);
    } else {
      console.error(
        `Error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    process.exitCode = 1;
  }
}
