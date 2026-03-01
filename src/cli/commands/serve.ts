/**
 * CLI serve command - starts the MCP server.
 */

import type { IFileSystem } from '@/domain/ports/index.js';
import { NodeFileSystem } from '@/adapters/filesystem/node-filesystem.js';
import { createCompositionRoot } from '@/composition-root.js';
import { startStdioServer } from '@/adapters/mcp/server.js';

export async function serveCommand(
  options: { dir: string; transport: string },
  fileSystem?: IFileSystem,
): Promise<void> {
  const fs = fileSystem ?? new NodeFileSystem(options.dir);

  try {
    const { dependencies } = await createCompositionRoot(fs, {
      dbPath: `${options.dir}/.heury/heury.db`,
    });

    if (options.transport === 'stdio') {
      console.error(`Starting heury MCP server (stdio) in ${options.dir}`);
      await startStdioServer({
        codeUnitRepo: dependencies.codeUnitRepo,
        dependencyRepo: dependencies.dependencyRepo,
        envVarRepo: dependencies.envVarRepo,
        fileSystem: fs,
        functionCallRepo: dependencies.functionCallRepo,
        typeFieldRepo: dependencies.typeFieldRepo,
        eventFlowRepo: dependencies.eventFlowRepo,
        schemaModelRepo: dependencies.schemaModelRepo,
        guardClauseRepo: dependencies.guardClauseRepo,
        fileClusterRepo: dependencies.fileClusterRepo,
        patternTemplateRepo: dependencies.patternTemplateRepo,
      });
    } else {
      console.error(`Unsupported transport: ${options.transport}. Use "stdio".`);
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(
      `Error: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  }
}
