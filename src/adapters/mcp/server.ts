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
  IGuardClauseRepository,
  IFileClusterRepository,
  IPatternTemplateRepository,
  IFileAnalyzer,
} from '@/domain/ports/index.js';
import { ToolRegistry } from './tool-registry.js';
import { MCP_SERVER_INSTRUCTIONS } from './instructions.js';
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
import { createGetPatternsByTypeTool } from './tools/get-patterns-by-type.js';
import { createGetUnitSummariesTool } from './tools/get-unit-summaries.js';
import { createGetFunctionGuardsTool } from './tools/get-function-guards.js';
import { createGetFeatureAreaTool } from './tools/get-feature-area.js';
import { createFindImplementationPatternTool } from './tools/find-implementation-pattern.js';
import { createPlanChangeImpactTool } from './tools/plan-change-impact.js';
import { createGetImplementationContextTool } from './tools/get-implementation-context.js';
import { createValidateAgainstPatternsTool } from './tools/validate-against-patterns.js';
import { createGetTestPatternsTool } from './tools/get-test-patterns.js';
import type { ToolDefinition, ToolHandler } from './tool-registry.js';

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
  guardClauseRepo?: IGuardClauseRepository;
  fileClusterRepo?: IFileClusterRepository;
  patternTemplateRepo?: IPatternTemplateRepository;
  fileAnalyzer?: IFileAnalyzer;
}

interface ToolEntry {
  readonly definition: ToolDefinition;
  readonly handler: ToolHandler;
}

type ToolFactory = (deps: McpServerDependencies) => ToolEntry | null;

/**
 * Tool factory entries. Each factory receives full deps and returns a tool
 * or null if its required dependencies are missing.
 */
const toolFactories: readonly ToolFactory[] = [
  // Core tools (always available)
  (deps) =>
    createGetAnalysisStatsTool({
      codeUnitRepo: deps.codeUnitRepo,
      dependencyRepo: deps.dependencyRepo,
      envVarRepo: deps.envVarRepo,
    }),
  (deps) => createGetModuleOverviewTool({ codeUnitRepo: deps.codeUnitRepo }),
  (deps) =>
    createSearchCodebaseTool({ codeUnitRepo: deps.codeUnitRepo, fileSystem: deps.fileSystem }),
  (deps) =>
    createGetCodeUnitsTool({ codeUnitRepo: deps.codeUnitRepo, fileSystem: deps.fileSystem }),
  (deps) => createGetDependenciesTool({ dependencyRepo: deps.dependencyRepo }),
  (deps) => createGetApiEndpointsTool({ codeUnitRepo: deps.codeUnitRepo }),
  (deps) => createGetFileContentTool({ fileSystem: deps.fileSystem }),
  (deps) => createGetEnvVariablesTool({ envVarRepo: deps.envVarRepo }),
  (deps) => createGetPatternsByTypeTool({ codeUnitRepo: deps.codeUnitRepo }),
  (deps) => createVectorSearchTool({ vectorSearch: deps.vectorSearch }),
  (deps) =>
    createPlanChangeImpactTool({
      dependencyRepo: deps.dependencyRepo,
      codeUnitRepo: deps.codeUnitRepo,
      fileClusterRepo: deps.fileClusterRepo,
      fileSystem: deps.fileSystem,
    }),

  // Deep analysis tools (conditional on optional deps)
  (deps) =>
    deps.functionCallRepo
      ? createTraceCallChainTool({
          functionCallRepo: deps.functionCallRepo,
          codeUnitRepo: deps.codeUnitRepo,
          fileSystem: deps.fileSystem,
        })
      : null,
  (deps) =>
    deps.eventFlowRepo
      ? createGetEventFlowTool({
          eventFlowRepo: deps.eventFlowRepo,
          codeUnitRepo: deps.codeUnitRepo,
        })
      : null,
  (deps) =>
    deps.schemaModelRepo
      ? createGetDataModelsTool({ schemaModelRepo: deps.schemaModelRepo })
      : null,
  (deps) =>
    deps.unitSummaryRepo
      ? createGetUnitSummariesTool({
          unitSummaryRepo: deps.unitSummaryRepo,
          codeUnitRepo: deps.codeUnitRepo,
        })
      : null,
  (deps) =>
    deps.guardClauseRepo
      ? createGetFunctionGuardsTool({
          guardClauseRepo: deps.guardClauseRepo,
          codeUnitRepo: deps.codeUnitRepo,
        })
      : null,
  (deps) =>
    deps.fileClusterRepo
      ? createGetFeatureAreaTool({
          fileClusterRepo: deps.fileClusterRepo,
          codeUnitRepo: deps.codeUnitRepo,
          dependencyRepo: deps.dependencyRepo,
        })
      : null,
  (deps) =>
    deps.patternTemplateRepo
      ? createFindImplementationPatternTool({
          patternTemplateRepo: deps.patternTemplateRepo,
          codeUnitRepo: deps.codeUnitRepo,
        })
      : null,
  (deps) =>
    deps.patternTemplateRepo
      ? createValidateAgainstPatternsTool({
          fileSystem: deps.fileSystem,
          patternTemplateRepo: deps.patternTemplateRepo,
          codeUnitRepo: deps.codeUnitRepo,
          fileAnalyzer: deps.fileAnalyzer,
        })
      : null,
  (deps) =>
    deps.functionCallRepo && deps.typeFieldRepo && deps.eventFlowRepo
      ? createGetFunctionContextTool({
          codeUnitRepo: deps.codeUnitRepo,
          functionCallRepo: deps.functionCallRepo,
          typeFieldRepo: deps.typeFieldRepo,
          eventFlowRepo: deps.eventFlowRepo,
          unitSummaryRepo: deps.unitSummaryRepo,
          fileSystem: deps.fileSystem,
        })
      : null,

  // Implementation-phase tools (always registered, optional deps handled internally)
  (deps) =>
    createGetImplementationContextTool({
      codeUnitRepo: deps.codeUnitRepo,
      fileSystem: deps.fileSystem,
      dependencyRepo: deps.dependencyRepo,
      fileClusterRepo: deps.fileClusterRepo,
      patternTemplateRepo: deps.patternTemplateRepo,
      vectorSearch: deps.vectorSearch,
    }),
  (deps) =>
    createGetTestPatternsTool({
      fileSystem: deps.fileSystem,
      codeUnitRepo: deps.codeUnitRepo,
      fileClusterRepo: deps.fileClusterRepo,
      patternTemplateRepo: deps.patternTemplateRepo,
    }),
];

export function createMcpServer(deps: McpServerDependencies): Server {
  const server = new Server(
    { name: 'heury', version: '0.1.0' },
    {
      capabilities: { tools: {} },
      instructions: MCP_SERVER_INSTRUCTIONS,
    },
  );

  const registry = new ToolRegistry();

  for (const factory of toolFactories) {
    const tool = factory(deps);
    if (tool) {
      registry.register(tool.definition, tool.handler);
    }
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
