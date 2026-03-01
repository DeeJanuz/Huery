/**
 * CLI ui command - starts the UI viewer server.
 */

import type { IFileSystem } from '@/domain/ports/index.js';
import { NodeFileSystem } from '@/adapters/filesystem/node-filesystem.js';
import { createCompositionRoot } from '@/composition-root.js';
import { createUiServer } from '@/adapters/ui/server.js';

export async function uiCommand(
  options: { dir: string; port: string; host: string },
  fileSystem?: IFileSystem,
): Promise<void> {
  const fs = fileSystem ?? new NodeFileSystem(options.dir);
  const port = Number(options.port);

  try {
    const { dependencies } = await createCompositionRoot(fs, {
      dbPath: `${options.dir}/.heury/heury.db`,
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
    });

    await server.start(port, options.host);
    const displayHost = options.host === '0.0.0.0' ? 'localhost' : options.host;
    console.log(`Heury UI available at http://${displayHost}:${port}`);
    console.log('Press Ctrl+C to stop');

    // Keep the process alive
    setInterval(() => {}, 1 << 30);
  } catch (error) {
    console.error(
      `Error: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  }
}
