/**
 * MCP Server factory for heury.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import type {
  ICodeUnitRepository,
  IFileDependencyRepository,
  IEnvVariableRepository,
  IFileSystem,
  IVectorSearchService,
} from '@/domain/ports/index.js';
import { ToolRegistry } from './tool-registry.js';
import { createGetAnalysisStatsTool } from './tools/get-analysis-stats.js';
import { createGetModuleOverviewTool } from './tools/get-module-overview.js';
import { createSearchCodebaseTool } from './tools/search-codebase.js';
import { createGetCodeUnitsTool } from './tools/get-code-units.js';
import { createGetDependenciesTool } from './tools/get-dependencies.js';
import { createGetApiEndpointsTool } from './tools/get-api-endpoints.js';
import { createGetFileContentTool } from './tools/get-file-content.js';
import { createVectorSearchTool } from './tools/vector-search.js';

export interface McpServerDependencies {
  codeUnitRepo: ICodeUnitRepository;
  dependencyRepo: IFileDependencyRepository;
  envVarRepo: IEnvVariableRepository;
  fileSystem: IFileSystem;
  vectorSearch?: IVectorSearchService;
}

export function createMcpServer(deps: McpServerDependencies): Server {
  const server = new Server(
    { name: 'heury', version: '0.1.0' },
    {
      capabilities: { tools: {} },
      instructions: `Heury: local codebase analysis for LLM discovery.

Optimized hybrid workflow:
1. ORIENT: Read .heury/MODULES.md, PATTERNS.md, DEPENDENCIES.md, HOTSPOTS.md (~5K tokens total) for instant codebase understanding
2. TARGET: Use get_code_units or search_codebase to find specific functions/classes relevant to your task
3. READ: Use get_file_content to read the actual source code of files you need
4. VERIFY: Use get_dependencies to understand import relationships

Quick reference:
- get_analysis_stats: High-level stats (code units, files, languages, patterns)
- get_module_overview: All files with their code units listed
- search_codebase: Search by name, file path, or pattern value
- get_code_units: Filter by file, type, language, complexity, export status
- get_dependencies: Import graph filtered by source or target file
- get_api_endpoints: API routes with HTTP methods and handler locations
- get_file_content: Read source files with optional line ranges
- vector_search: Semantic similarity search across code units

Token tips: Start with manifests (free orientation). Use get_analysis_stats before get_module_overview. Filter with specific params rather than fetching all.`,
    },
  );

  const registry = new ToolRegistry();

  // Register all tools
  const tools = [
    createGetAnalysisStatsTool({
      codeUnitRepo: deps.codeUnitRepo,
      dependencyRepo: deps.dependencyRepo,
      envVarRepo: deps.envVarRepo,
    }),
    createGetModuleOverviewTool({ codeUnitRepo: deps.codeUnitRepo }),
    createSearchCodebaseTool({ codeUnitRepo: deps.codeUnitRepo }),
    createGetCodeUnitsTool({ codeUnitRepo: deps.codeUnitRepo }),
    createGetDependenciesTool({ dependencyRepo: deps.dependencyRepo }),
    createGetApiEndpointsTool({ codeUnitRepo: deps.codeUnitRepo }),
    createGetFileContentTool({ fileSystem: deps.fileSystem }),
    createVectorSearchTool({ vectorSearch: deps.vectorSearch }),
  ];

  for (const tool of tools) {
    registry.register(tool.definition, tool.handler);
  }

  // Handle tools/list
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: registry.getDefinitions(),
  }));

  // Handle tools/call
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    return registry.handleToolCall(name, args ?? {});
  });

  return server;
}

/** Start stdio transport. */
export async function startStdioServer(deps: McpServerDependencies): Promise<void> {
  const server = createMcpServer(deps);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
