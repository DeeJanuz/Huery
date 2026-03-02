import type { ICodeUnitRepository, IFileDependencyRepository, ITypeFieldRepository, IFileClusterRepository } from '@/domain/ports/index.js';
import type { CodeUnit, RepositoryFileCluster, RepositoryFileClusterMember } from '@/domain/models/index.js';
import { CodeUnitType, PatternType } from '@/domain/models/index.js';
import { estimateTokens, fitSections, type Section } from './token-budgeter.js';

export interface ModulesGeneratorDeps {
  readonly codeUnitRepo: ICodeUnitRepository;
  readonly dependencyRepo: IFileDependencyRepository;
  readonly maxTokens: number;
  readonly typeFieldRepo?: ITypeFieldRepository;
  readonly fileClusterRepo?: IFileClusterRepository;
}

const SCORED_PATTERN_TYPES = new Set<string>([
  PatternType.API_ENDPOINT,
  PatternType.DATABASE_READ,
  PatternType.DATABASE_WRITE,
  PatternType.EXTERNAL_SERVICE,
]);

const COMPLEXITY_THRESHOLD = 15;

const MAX_CLUSTER_PATTERNS = 5;

/**
 * Generate MODULES.md - overview of all code modules/files.
 * Groups code units by file path, scored by relevance and fitted to budget.
 * Optionally appends a Feature Areas section from file clusters.
 */
export function generateModulesManifest(deps: ModulesGeneratorDeps): string {
  const { codeUnitRepo, dependencyRepo, maxTokens, typeFieldRepo, fileClusterRepo } = deps;
  const allUnits = codeUnitRepo.findAll();
  const fileGroups = groupByFilePath(allUnits);

  const moduleSections: Section[] = [];

  for (const [filePath, units] of fileGroups) {
    const content = buildFileSection(filePath, units, typeFieldRepo);
    const score = scoreFile(units, filePath, dependencyRepo);
    moduleSections.push({ content, score });
  }

  const modulesOutput = fitSections('# Modules\n', moduleSections, maxTokens);

  const clusterSections = buildClusterSections(fileGroups, fileClusterRepo);
  if (clusterSections.length === 0) {
    return modulesOutput;
  }

  const remainingTokens = maxTokens - estimateTokens(modulesOutput);
  if (remainingTokens <= 0) {
    return modulesOutput;
  }

  const clusterHeader = '\n## Feature Areas (Import Graph Clusters)\n\n';
  const clusterOutput = fitSections(clusterHeader, clusterSections, remainingTokens);

  // Only append if at least one cluster was included (not just the header)
  if (clusterOutput === clusterHeader) {
    return modulesOutput;
  }

  return modulesOutput + clusterOutput;
}

const TYPE_FIELD_UNIT_TYPES = new Set<CodeUnitType>([
  CodeUnitType.CLASS,
  CodeUnitType.INTERFACE,
  CodeUnitType.TYPE_ALIAS,
  CodeUnitType.STRUCT,
  CodeUnitType.ENUM,
]);

function buildFileSection(filePath: string, units: CodeUnit[], typeFieldRepo?: ITypeFieldRepository): string {
  const lines: string[] = [];
  lines.push(`## ${filePath}`);

  const topLevelUnits = units.filter((u) => !u.parentUnitId);
  const childUnits = units.filter((u) => u.parentUnitId);

  for (const unit of topLevelUnits) {
    lines.push(formatCodeUnit(unit, '- '));
    appendTypeFields(lines, unit, '  ', typeFieldRepo);

    const children = childUnits.filter((c) => c.parentUnitId === unit.id);
    for (const child of children) {
      lines.push(formatCodeUnit(child, '  - '));
      appendTypeFields(lines, child, '    ', typeFieldRepo);
    }
  }

  const patternTypes = collectPatternTypes(units);
  if (patternTypes.length > 0) {
    lines.push(`- Patterns: ${patternTypes.join(', ')}`);
  }

  lines.push('');
  return lines.join('\n');
}

function appendTypeFields(
  lines: string[],
  unit: CodeUnit,
  indent: string,
  typeFieldRepo?: ITypeFieldRepository,
): void {
  if (!typeFieldRepo || !TYPE_FIELD_UNIT_TYPES.has(unit.unitType)) {
    return;
  }

  const fields = typeFieldRepo.findByParentUnitId(unit.id);
  for (const field of fields) {
    const readonlyPrefix = field.isReadonly ? 'readonly ' : '';
    const optionalSuffix = field.isOptional ? '?' : '';
    const optionalFlag = field.isOptional ? ' (optional)' : '';
    lines.push(`${indent}- ${readonlyPrefix}${field.name}${optionalSuffix}: ${field.fieldType}${optionalFlag}`);
  }
}

function scoreFile(
  units: CodeUnit[],
  filePath: string,
  dependencyRepo: IFileDependencyRepository,
): number {
  let score = 0;

  for (const unit of units) {
    if (unit.isExported) {
      score += 3;
    }

    for (const pattern of unit.patterns) {
      if (SCORED_PATTERN_TYPES.has(pattern.patternType)) {
        score += 2;
      }
    }

    if (unit.complexityScore >= COMPLEXITY_THRESHOLD) {
      score += 1;
    }
  }

  const inboundDeps = dependencyRepo.findByTargetFile(filePath);
  score += inboundDeps.length;

  return score;
}

function groupByFilePath(units: CodeUnit[]): Map<string, CodeUnit[]> {
  const groups = new Map<string, CodeUnit[]>();
  for (const unit of units) {
    const existing = groups.get(unit.filePath) ?? [];
    existing.push(unit);
    groups.set(unit.filePath, existing);
  }
  return groups;
}

function formatCodeUnit(unit: CodeUnit, prefix: string): string {
  const typeName = formatType(unit.unitType);
  const asyncLabel = unit.isAsync ? 'async ' : '';
  const rawSignature = unit.isExported && unit.signature ? unit.signature : '';
  const signatureLabel = rawSignature && !rawSignature.startsWith('(') ? ` ${rawSignature}` : rawSignature;
  const complexityLabel =
    unit.complexityScore > 0 ? `, complexity: ${unit.complexityScore}` : '';

  return `${prefix}\`${unit.name}\` - ${asyncLabel}${typeName}${signatureLabel}${complexityLabel}`;
}

function formatType(unitType: CodeUnitType): string {
  switch (unitType) {
    case CodeUnitType.FUNCTION:
    case CodeUnitType.ARROW_FUNCTION:
      return 'function';
    case CodeUnitType.CLASS:
      return 'class';
    case CodeUnitType.METHOD:
      return 'method';
    case CodeUnitType.STRUCT:
      return 'struct';
    case CodeUnitType.TRAIT:
      return 'trait';
    case CodeUnitType.INTERFACE:
      return 'interface';
    case CodeUnitType.ENUM:
      return 'enum';
    case CodeUnitType.IMPL_BLOCK:
      return 'impl';
    case CodeUnitType.TYPE_ALIAS:
      return 'type';
    case CodeUnitType.MODULE:
      return 'module';
    default:
      return 'unknown';
  }
}

function collectPatternTypes(units: CodeUnit[]): string[] {
  const types = new Set<string>();
  for (const unit of units) {
    for (const pattern of unit.patterns) {
      types.add(pattern.patternType);
    }
  }
  return [...types].sort();
}

/**
 * Build scored sections for file clusters.
 * Each cluster becomes a section with score = member count (so largest clusters are prioritised).
 */
function buildClusterSections(
  fileGroups: Map<string, CodeUnit[]>,
  fileClusterRepo?: IFileClusterRepository,
): Section[] {
  if (!fileClusterRepo) {
    return [];
  }

  const allClusters = fileClusterRepo.findAll();
  if (allClusters.length === 0) {
    return [];
  }

  return allClusters.map(({ cluster, members }) => ({
    content: buildClusterSection(cluster, members, fileGroups),
    score: members.length,
  }));
}

function buildClusterSection(
  cluster: RepositoryFileCluster,
  members: RepositoryFileClusterMember[],
  fileGroups: Map<string, CodeUnit[]>,
): string {
  const lines: string[] = [];
  lines.push(`### ${cluster.name} (cohesion: ${cluster.cohesion.toFixed(2)}, ${members.length} files)`);

  const entryPoints = members.filter((m) => m.isEntryPoint).map((m) => m.filePath);
  if (entryPoints.length > 0) {
    lines.push(`Entry points: ${entryPoints.join(', ')}`);
  }

  const patternCounts = aggregateClusterPatterns(members, fileGroups);
  if (patternCounts.length > 0) {
    const topPatterns = patternCounts
      .slice(0, MAX_CLUSTER_PATTERNS)
      .map(([type, count]) => `${type} (${count})`)
      .join(', ');
    lines.push(`Top patterns: ${topPatterns}`);
  }

  lines.push('');
  return lines.join('\n');
}

/**
 * Aggregate pattern type counts across all files in a cluster.
 * Returns entries sorted by count descending, then alphabetically.
 */
function aggregateClusterPatterns(
  members: RepositoryFileClusterMember[],
  fileGroups: Map<string, CodeUnit[]>,
): [string, number][] {
  const counts = new Map<string, number>();

  for (const member of members) {
    const units = fileGroups.get(member.filePath) ?? [];
    for (const unit of units) {
      for (const pattern of unit.patterns) {
        counts.set(pattern.patternType, (counts.get(pattern.patternType) ?? 0) + 1);
      }
    }
  }

  return [...counts.entries()].sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return a[0].localeCompare(b[0]);
  });
}
