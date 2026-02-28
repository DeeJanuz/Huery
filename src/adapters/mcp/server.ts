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
  IFunctionCallRepository,
  ITypeFieldRepository,
  IEventFlowRepository,
  ISchemaModelRepository,
  IUnitSummaryRepository,
} from '@/domain/ports/index.js';
import { ToolRegistry } from './tool-registry.js';
import { createGetAnalysisStatsTool } from './tools/get-analysis-stats.js';
import { createGetModuleOverviewTool } from './tools/get-module-overview.js';
import { createSearchCodebaseTool } from './tools/search-codebase.js';
import { createGetCodeUnitsTool } from './tools/get-code-units.js';
import { createGetDependenciesTool } from './tools/get-dependencies.js';
import { createGetApiEndpointsTool } from './tools/get-api-endpoints.js';
import { createGetFileContentTool } from './tools/get-file-content.js';
import { createGetEnvVariablesTool } from './tools/get-env-variables.js';
import { createVectorSearchTool } from './tools/vector-search.js';
import { createTraceCallChainTool } from './tools/trace-call-chain.js';
import { createGetEventFlowTool } from './tools/get-event-flow.js';
import { createGetDataModelsTool } from './tools/get-data-models.js';
import { createGetFunctionContextTool } from './tools/get-function-context.js';

export interface McpServerDependencies {
  codeUnitRepo: ICodeUnitRepository;
  dependencyRepo: IFileDependencyRepository;
  envVarRepo: IEnvVariableRepository;
  fileSystem: IFileSystem;
  vectorSearch?: IVectorSearchService;
  // Deep analysis repos (optional)
  functionCallRepo?: IFunctionCallRepository;
  typeFieldRepo?: ITypeFieldRepository;
  eventFlowRepo?: IEventFlowRepository;
  schemaModelRepo?: ISchemaModelRepository;
  unitSummaryRepo?: IUnitSummaryRepository;
}

export function createMcpServer(deps: McpServerDependencies): Server {
  const server = new Server(
    { name: 'heury', version: '0.1.0' },
    {
      capabilities: { tools: {} },
      instructions: `Heury: local codebase analysis for LLM discovery.

Optimized hybrid workflow:
1. ORIENT: Read .heury/MODULES.md, PATTERNS.md, DEPENDENCIES.md, HOTSPOTS.md (~10K tokens total) for instant codebase understanding. Manifests are relevance-ranked — most important files and sections appear first. Omitted items are available via MCP tools.
2. TARGET: Use get_code_units (is_exported: true) or search_codebase to find specific functions/classes. Compact format includes signatures — often enough to understand contracts without reading source.
3. READ: Use get_file_content only when you need implementation details beyond the signature
4. VERIFY: Use get_dependencies to understand import relationships

Quick reference:
- get_analysis_stats: High-level stats (code units, files, languages, patterns)
- get_module_overview: All files with their code units and signatures
- search_codebase: Search by name, file path, or pattern value (includes signatures)
- get_code_units: Filter by file, type, language, complexity, export status. Use is_exported: true for public API discovery.
- get_dependencies: Import graph filtered by source or target file
- get_api_endpoints: API routes with HTTP methods and handler locations
- get_env_variables: List environment variables from .env.example files
- get_file_content: Read source files with optional line ranges
- vector_search: Semantic similarity search across code units
- trace_call_chain: Trace function call chains forward (callees) or backward (callers) with configurable depth
- get_event_flow: Query event emissions and subscriptions by event name, direction, or framework
- get_data_models: List schema/data models with their fields, types, and relations
- get_function_context: Complete context for a function: signature, calls, callers, events, types, summary

Token tips: Start with manifests (free orientation, relevance-ranked). Use get_code_units with is_exported: true to discover public APIs before reading source. Compact format includes signatures — check contracts before reading full files.`,
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
    createGetEnvVariablesTool({ envVarRepo: deps.envVarRepo }),
    createVectorSearchTool({ vectorSearch: deps.vectorSearch }),
  ];

  // Conditionally register deep analysis tools when their deps are available
  if (deps.functionCallRepo) {
    tools.push(
      createTraceCallChainTool({
        functionCallRepo: deps.functionCallRepo,
        codeUnitRepo: deps.codeUnitRepo,
      }),
    );
  }
  if (deps.eventFlowRepo) {
    tools.push(
      createGetEventFlowTool({
        eventFlowRepo: deps.eventFlowRepo,
        codeUnitRepo: deps.codeUnitRepo,
      }),
    );
  }
  if (deps.schemaModelRepo) {
    tools.push(
      createGetDataModelsTool({
        schemaModelRepo: deps.schemaModelRepo,
      }),
    );
  }
  if (deps.functionCallRepo && deps.typeFieldRepo && deps.eventFlowRepo) {
    tools.push(
      createGetFunctionContextTool({
        codeUnitRepo: deps.codeUnitRepo,
        functionCallRepo: deps.functionCallRepo,
        typeFieldRepo: deps.typeFieldRepo,
        eventFlowRepo: deps.eventFlowRepo,
        unitSummaryRepo: deps.unitSummaryRepo,
      }),
    );
  }

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
