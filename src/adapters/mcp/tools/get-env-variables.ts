/**
 * MCP tool: get-env-variables
 * List environment variables detected in .env.example files.
 */

import type { IEnvVariableRepository } from '@/domain/ports/index.js';
import { buildToolResponse } from '../response-builder.js';
import type { ToolDefinition, ToolHandler } from '../tool-registry.js';

interface Dependencies {
  envVarRepo: IEnvVariableRepository;
}

export function createGetEnvVariablesTool(deps: Dependencies): {
  definition: ToolDefinition;
  handler: ToolHandler;
} {
  const definition: ToolDefinition = {
    name: 'get-env-variables',
    description: 'List environment variables detected in .env.example files',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  };

  const handler: ToolHandler = async () => {
    const allVars = deps.envVarRepo.findAll();

    const mapped = allVars.map((v) => {
      const result: { name: string; description?: string; hasDefault: boolean } = {
        name: v.name,
        hasDefault: v.hasDefault,
      };
      if (v.description !== undefined) {
        result.description = v.description;
      }
      return result;
    });

    return buildToolResponse(mapped);
  };

  return { definition, handler };
}
