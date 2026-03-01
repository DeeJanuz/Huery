/**
 * MCP tool: get-implementation-context
 * Bundles everything an LLM needs to implement a feature into a single call.
 * Composes data from code units, dependencies, patterns, clusters, and source.
 */

import type {
  ICodeUnitRepository,
  IFileSystem,
  IFileDependencyRepository,
  IFileClusterRepository,
  IPatternTemplateRepository,
  IVectorSearchService,
} from '@/domain/ports/index.js';
import type { CodeUnit } from '@/domain/models/index.js';
import { extractSourceForUnits } from '../source-extractor.js';
import { buildToolResponse, buildErrorResponse } from '../response-builder.js';
import type { ToolDefinition, ToolHandler } from '../tool-registry.js';
import { generateTestFileCandidates } from '../test-file-discovery.js';

interface Dependencies {
  codeUnitRepo: ICodeUnitRepository;
  fileSystem: IFileSystem;
  dependencyRepo: IFileDependencyRepository;
  fileClusterRepo?: IFileClusterRepository;
  patternTemplateRepo?: IPatternTemplateRepository;
  vectorSearch?: IVectorSearchService;
}

export function createGetImplementationContextTool(deps: Dependencies): {
  definition: ToolDefinition;
  handler: ToolHandler;
} {
  const definition: ToolDefinition = {
    name: 'get-implementation-context',
    description:
      'Bundle everything needed to implement a feature: code units, dependencies, source, patterns, test files, and feature area. Provide at least one of query, file_path, or unit_name.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query to find relevant code units',
        },
        file_path: {
          type: 'string',
          description: 'File path to get implementation context for',
        },
        unit_name: {
          type: 'string',
          description: 'Code unit name to get context for',
        },
        include_source: {
          type: 'boolean',
          description: 'Include source code (default: true)',
        },
      },
    },
  };

  const handler: ToolHandler = async (args: Record<string, unknown>) => {
    const query = typeof args.query === 'string' ? args.query : undefined;
    const filePath = typeof args.file_path === 'string' ? args.file_path : undefined;
    const unitName = typeof args.unit_name === 'string' ? args.unit_name : undefined;
    const includeSource = args.include_source !== false;

    if (!query && !filePath && !unitName) {
      return buildErrorResponse(
        'At least one of query, file_path, or unit_name must be provided.',
      );
    }

    // 1. Resolve primary units
    const primaryUnits = resolvePrimaryUnits(deps.codeUnitRepo, {
      query,
      filePath,
      unitName,
    });

    // 2. Get dependencies for all unique file paths
    const uniqueFilePaths = [...new Set(primaryUnits.map((u) => u.filePath))];

    const imports = uniqueFilePaths.flatMap((fp) =>
      deps.dependencyRepo.findBySourceFile(fp).map((d) => ({
        sourceFile: d.sourceFile,
        targetFile: d.targetFile,
        importedNames: d.importedNames.length > 0 ? d.importedNames : undefined,
      })),
    );

    const importedBy = uniqueFilePaths.flatMap((fp) =>
      deps.dependencyRepo.findByTargetFile(fp).map((d) => ({
        sourceFile: d.sourceFile,
        targetFile: d.targetFile,
        importedNames: d.importedNames.length > 0 ? d.importedNames : undefined,
      })),
    );

    // 3. Get source for primary units
    let sourceMap: (string | null)[] | null = null;
    if (includeSource) {
      sourceMap = await extractSourceForUnits(deps.fileSystem, primaryUnits);
    }

    // 4. Find related pattern templates
    const relatedPatterns = findRelatedPatterns(deps.patternTemplateRepo, primaryUnits);

    // 5. Discover test files
    const testFiles = await discoverTestFiles(deps.fileSystem, uniqueFilePaths);

    // 6. Get feature area
    const featureArea = findFeatureArea(deps.fileClusterRepo, uniqueFilePaths);

    // Build response
    const primaryUnitsData = primaryUnits.map((unit, idx) => {
      const entry: Record<string, unknown> = {
        name: unit.name,
        filePath: unit.filePath,
        unitType: unit.unitType,
        lineStart: unit.lineStart,
        lineEnd: unit.lineEnd,
      };

      if (unit.signature) {
        entry.signature = unit.signature;
      }

      if (includeSource && sourceMap) {
        entry.source = sourceMap[idx];
      }

      entry.patterns = unit.patterns.map((p) => ({
        patternType: p.patternType,
        patternValue: p.patternValue,
      }));

      return entry;
    });

    const data = {
      primaryUnits: primaryUnitsData,
      dependencies: {
        imports,
        importedBy,
      },
      relatedPatterns,
      testFiles,
      featureArea,
    };

    return buildToolResponse(data);
  };

  return { definition, handler };
}

function resolvePrimaryUnits(
  codeUnitRepo: ICodeUnitRepository,
  input: { query?: string; filePath?: string; unitName?: string },
): CodeUnit[] {
  if (input.filePath) {
    return codeUnitRepo.findByFilePath(input.filePath);
  }

  if (input.unitName) {
    return codeUnitRepo.findAll().filter((u) => u.name === input.unitName);
  }

  if (input.query) {
    const queryLower = input.query.toLowerCase();
    return codeUnitRepo.findAll().filter(
      (u) =>
        u.name.toLowerCase().includes(queryLower) ||
        u.filePath.toLowerCase().includes(queryLower),
    );
  }

  return [];
}

function findRelatedPatterns(
  patternTemplateRepo: IPatternTemplateRepository | undefined,
  primaryUnits: CodeUnit[],
): Array<{
  name: string;
  conventions: string[];
  templateFilePath: string;
}> | null {
  if (!patternTemplateRepo) {
    return null;
  }

  // Collect all pattern types from primary units
  const patternTypes = new Set<string>();
  for (const unit of primaryUnits) {
    for (const pattern of unit.patterns) {
      patternTypes.add(pattern.patternType);
    }
  }

  if (patternTypes.size === 0) {
    return [];
  }

  const allTemplates = patternTemplateRepo.findAll();
  const matched = new Map<string, { name: string; conventions: string[]; templateFilePath: string }>();

  for (const { template } of allTemplates) {
    // Fuzzy match: any overlap between unit pattern types and template pattern types
    const hasOverlap = template.patternTypes.some((pt) => patternTypes.has(pt));
    if (hasOverlap && !matched.has(template.id)) {
      matched.set(template.id, {
        name: template.name,
        conventions: template.conventions,
        templateFilePath: template.templateFilePath,
      });
    }
  }

  return [...matched.values()];
}

async function discoverTestFiles(
  fileSystem: IFileSystem,
  filePaths: string[],
): Promise<Array<{ path: string; exists: boolean }>> {
  const results: Array<{ path: string; exists: boolean }> = [];
  const seen = new Set<string>();

  for (const fp of filePaths) {
    const candidates = generateTestFileCandidates(fp);
    for (const candidate of candidates) {
      if (seen.has(candidate.testFilePath)) continue;
      seen.add(candidate.testFilePath);
      const exists = await fileSystem.exists(candidate.testFilePath);
      results.push({ path: candidate.testFilePath, exists });
    }
  }

  return results;
}

function findFeatureArea(
  fileClusterRepo: IFileClusterRepository | undefined,
  filePaths: string[],
): { name: string; files: string[]; entryPoints: string[] } | null {
  if (!fileClusterRepo) {
    return null;
  }

  // Find the first cluster that contains any of the primary unit files
  for (const fp of filePaths) {
    const result = fileClusterRepo.findByFilePath(fp);
    if (result) {
      const files = result.members.map((m) => m.filePath);
      const entryPoints = result.members
        .filter((m) => m.isEntryPoint)
        .map((m) => m.filePath);
      return {
        name: result.cluster.name,
        files,
        entryPoints,
      };
    }
  }

  return null;
}
