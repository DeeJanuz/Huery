/**
 * MCP tool: plan-change-impact
 * Assesses the impact of changing a file or function by combining transitive
 * dependents, circular deps, cluster membership, and code unit info.
 */

import type {
  IFileDependencyRepository,
  ICodeUnitRepository,
  IFileClusterRepository,
  IFileSystem,
} from '@/domain/ports/index.js';
import type { CodeUnit } from '@/domain/models/index.js';
import { computeTransitiveDeps } from '@/application/graph-analysis/transitive-deps.js';
import { detectCircularDeps } from '@/application/graph-analysis/circular-deps.js';
import { buildToolResponse, buildErrorResponse } from '../response-builder.js';
import type { ToolDefinition, ToolHandler } from '../tool-registry.js';
import { extractSourceForUnit } from '../source-extractor.js';

interface Dependencies {
  dependencyRepo: IFileDependencyRepository;
  codeUnitRepo: ICodeUnitRepository;
  fileClusterRepo?: IFileClusterRepository;
  fileSystem?: IFileSystem;
}

interface TargetOutput {
  filePath: string;
  unitName?: string;
  unitType?: string;
  signature?: string;
}

interface DependentOutput {
  file: string;
  depth: number;
}

interface AffectedEndpoint {
  name: string;
  filePath: string;
  method?: string;
}

interface PatternCount {
  patternType: string;
  count: number;
}

interface CircularDepOutput {
  cycle: string[];
  length: number;
}

interface ClusterMembershipOutput {
  clusterId: string;
  clusterName: string;
  cohesion: number;
}

export function createPlanChangeImpactTool(deps: Dependencies): {
  definition: ToolDefinition;
  handler: ToolHandler;
} {
  const definition: ToolDefinition = {
    name: 'plan-change-impact',
    description:
      'Assess the impact of changing a file or function: transitive dependents, circular deps, affected endpoints/patterns, cluster membership, and risk assessment.',
    inputSchema: {
      type: 'object',
      properties: {
        file_path: {
          type: 'string',
          description: 'File path to assess change impact for',
        },
        unit_id: {
          type: 'string',
          description: 'Code unit ID to assess change impact for',
        },
        function_name: {
          type: 'string',
          description: 'Function name to search for and assess change impact',
        },
        depth: {
          type: 'number',
          description: 'Maximum depth for transitive dependency traversal (default: 5)',
        },
        include_source: {
          type: 'boolean',
          description: 'Include source code for the target and affected endpoints (default: false)',
        },
      },
    },
  };

  const handler: ToolHandler = async (args: Record<string, unknown>) => {
    const filePath = typeof args.file_path === 'string' ? args.file_path : undefined;
    const unitId = typeof args.unit_id === 'string' ? args.unit_id : undefined;
    const functionName = typeof args.function_name === 'string' ? args.function_name : undefined;
    const depth = typeof args.depth === 'number' ? args.depth : 5;
    const includeSource = args.include_source === true;

    if (!filePath && !unitId && !functionName) {
      return buildErrorResponse(
        'Provide at least one of: file_path, unit_id, or function_name',
      );
    }

    // 1. Resolve the target
    const resolved = resolveTarget(deps.codeUnitRepo, { filePath, unitId, functionName });
    if (!resolved) {
      return buildErrorResponse('Target not found');
    }

    const { target, resolvedFilePath } = resolved;

    // 2. Get all dependencies
    const allDeps = deps.dependencyRepo.findAll();

    // 3. Compute transitive dependents
    const transitiveDeps = computeTransitiveDeps(resolvedFilePath, 'dependents', allDeps, depth);

    // 4. Separate direct from transitive
    const directDependents: DependentOutput[] = transitiveDeps
      .filter((d) => d.depth === 1)
      .map((d) => ({ file: d.file, depth: d.depth }));

    const allDependentFiles: DependentOutput[] = transitiveDeps.map((d) => ({
      file: d.file,
      depth: d.depth,
    }));

    // 5. Detect circular deps, filter to those involving our file
    const allCircular = detectCircularDeps(allDeps);
    const relevantCircular: CircularDepOutput[] = allCircular
      .filter((cd) => cd.cycle.includes(resolvedFilePath))
      .map((cd) => ({ cycle: cd.cycle, length: cd.length }));

    // 6. Cluster membership
    const clusterMembership = resolveClusterMembership(deps.fileClusterRepo, resolvedFilePath);

    // 7. Gather affected code units in dependent files
    const dependentFilePaths = new Set(transitiveDeps.map((d) => d.file));
    const affectedCodeUnits = collectCodeUnitsForFiles(deps.codeUnitRepo, dependentFilePaths);

    // 8. Affected endpoints
    const affectedEndpointsRaw = extractEndpoints(affectedCodeUnits);

    // 9. Affected patterns
    const affectedPatterns = aggregatePatterns(affectedCodeUnits);

    // 10. Risk assessment
    const riskAssessment = assessRisk(
      directDependents.length,
      allDependentFiles.length,
      relevantCircular.length,
      affectedEndpointsRaw.length,
    );

    // 11. Source enrichment
    const targetData: Record<string, unknown> = { ...target };
    let affectedEndpoints: Record<string, unknown>[] = affectedEndpointsRaw as unknown as Record<string, unknown>[];

    if (includeSource && deps.fileSystem) {
      // Source for the target unit
      const resolvedUnit = resolveTargetUnit(deps.codeUnitRepo, { filePath, unitId, functionName });
      if (resolvedUnit) {
        targetData.source = await extractSourceForUnit(deps.fileSystem, {
          filePath: resolvedUnit.filePath,
          lineStart: resolvedUnit.lineStart,
          lineEnd: resolvedUnit.lineEnd,
        });
      }

      // Source for affected endpoint handler code units
      affectedEndpoints = await Promise.all(
        affectedEndpointsRaw.map(async (ep) => {
          const handlerUnit = affectedCodeUnits.find(
            (u) =>
              u.filePath === ep.filePath &&
              u.patterns.some((p) => p.patternType === 'API_ENDPOINT' && p.patternValue === ep.name),
          );
          if (handlerUnit) {
            const source = await extractSourceForUnit(deps.fileSystem!, {
              filePath: handlerUnit.filePath,
              lineStart: handlerUnit.lineStart,
              lineEnd: handlerUnit.lineEnd,
            });
            return { ...ep, source };
          }
          return { ...ep };
        }),
      );
    }

    const data = {
      target: targetData,
      directDependents,
      transitiveDependents: {
        count: allDependentFiles.length,
        files: allDependentFiles,
      },
      affectedEndpoints,
      affectedPatterns,
      circularDeps: relevantCircular,
      clusterMembership,
      riskAssessment,
    };

    return buildToolResponse(data);
  };

  return { definition, handler };
}

function resolveTarget(
  codeUnitRepo: ICodeUnitRepository,
  input: { filePath?: string; unitId?: string; functionName?: string },
): { target: TargetOutput; resolvedFilePath: string } | undefined {
  if (input.unitId) {
    const unit = codeUnitRepo.findById(input.unitId);
    if (!unit) return undefined;
    return {
      target: buildTargetFromUnit(unit),
      resolvedFilePath: unit.filePath,
    };
  }

  if (input.functionName) {
    const allUnits = codeUnitRepo.findAll();
    const match = allUnits.find((u) => u.name === input.functionName);
    if (!match) return undefined;
    return {
      target: buildTargetFromUnit(match),
      resolvedFilePath: match.filePath,
    };
  }

  if (input.filePath) {
    // Try to find a code unit in this file for richer info
    const units = codeUnitRepo.findByFilePath(input.filePath);
    if (units.length > 0) {
      const firstUnit = units[0];
      return {
        target: {
          filePath: input.filePath,
          unitName: firstUnit.name,
          unitType: firstUnit.unitType,
          signature: firstUnit.signature,
        },
        resolvedFilePath: input.filePath,
      };
    }
    return {
      target: { filePath: input.filePath },
      resolvedFilePath: input.filePath,
    };
  }

  return undefined;
}

function buildTargetFromUnit(unit: CodeUnit): TargetOutput {
  const target: TargetOutput = {
    filePath: unit.filePath,
    unitName: unit.name,
    unitType: unit.unitType,
  };
  if (unit.signature) {
    target.signature = unit.signature;
  }
  return target;
}

function resolveTargetUnit(
  codeUnitRepo: ICodeUnitRepository,
  input: { filePath?: string; unitId?: string; functionName?: string },
): CodeUnit | undefined {
  if (input.unitId) {
    return codeUnitRepo.findById(input.unitId);
  }
  if (input.functionName) {
    return codeUnitRepo.findAll().find((u) => u.name === input.functionName);
  }
  if (input.filePath) {
    const units = codeUnitRepo.findByFilePath(input.filePath);
    return units.length > 0 ? units[0] : undefined;
  }
  return undefined;
}

function resolveClusterMembership(
  fileClusterRepo: IFileClusterRepository | undefined,
  filePath: string,
): ClusterMembershipOutput | null {
  if (!fileClusterRepo) return null;
  const result = fileClusterRepo.findByFilePath(filePath);
  if (!result) return null;
  return {
    clusterId: result.cluster.id,
    clusterName: result.cluster.name,
    cohesion: result.cluster.cohesion,
  };
}

function collectCodeUnitsForFiles(
  codeUnitRepo: ICodeUnitRepository,
  filePaths: Set<string>,
): CodeUnit[] {
  const results: CodeUnit[] = [];
  for (const fp of filePaths) {
    const units = codeUnitRepo.findByFilePath(fp);
    results.push(...units);
  }
  return results;
}

function extractEndpoints(codeUnits: CodeUnit[]): AffectedEndpoint[] {
  const endpoints: AffectedEndpoint[] = [];
  for (const unit of codeUnits) {
    for (const pattern of unit.patterns) {
      if (pattern.patternType === 'API_ENDPOINT') {
        const endpoint: AffectedEndpoint = {
          name: pattern.patternValue,
          filePath: unit.filePath,
        };
        // Try to extract HTTP method from pattern value (e.g. "POST /login")
        const methodMatch = pattern.patternValue.match(/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s/i);
        if (methodMatch) {
          endpoint.method = methodMatch[1].toUpperCase();
        }
        endpoints.push(endpoint);
      }
    }
  }
  return endpoints;
}

function aggregatePatterns(codeUnits: CodeUnit[]): PatternCount[] {
  const counts = new Map<string, number>();
  for (const unit of codeUnits) {
    for (const pattern of unit.patterns) {
      counts.set(pattern.patternType, (counts.get(pattern.patternType) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([patternType, count]) => ({ patternType, count }))
    .sort((a, b) => b.count - a.count);
}

function assessRisk(
  directCount: number,
  transitiveCount: number,
  circularCount: number,
  endpointCount: number,
): string {
  const parts: string[] = [];

  if (circularCount > 0 || directCount >= 6) {
    parts.push('HIGH RISK');
  } else if (directCount >= 3 || endpointCount > 0) {
    parts.push('MEDIUM RISK');
  } else {
    parts.push('LOW RISK');
  }

  parts.push(`${directCount} direct dependent(s), ${transitiveCount} total affected file(s).`);

  if (endpointCount > 0) {
    parts.push(`${endpointCount} API endpoint(s) affected.`);
  }

  if (circularCount > 0) {
    parts.push(`${circularCount} circular dependency cycle(s) detected.`);
  }

  return parts.join(' ');
}
