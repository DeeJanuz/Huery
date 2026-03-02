import type { ICodeUnitRepository, IEnvVariableRepository, IEventFlowRepository, IPatternTemplateRepository } from '@/domain/ports/index.js';
import type { CodeUnit, CodeUnitPattern, EventFlow } from '@/domain/models/index.js';
import { PatternType } from '@/domain/models/index.js';
import { estimateTokens, fitSections, type Section } from './token-budgeter.js';

interface PatternEntry {
  readonly patternValue: string;
  readonly filePath: string;
  readonly functionName: string;
}

export interface PatternsGeneratorDeps {
  readonly codeUnitRepo: ICodeUnitRepository;
  readonly envVarRepo: IEnvVariableRepository;
  readonly maxTokens: number;
  readonly eventFlowRepo?: IEventFlowRepository;
  readonly patternTemplateRepo?: IPatternTemplateRepository;
}

/**
 * Generate PATTERNS.md - all detected patterns grouped by type.
 * Optionally appends a Conventions section from pattern templates.
 */
export function generatePatternsManifest(deps: PatternsGeneratorDeps): string {
  const { codeUnitRepo, envVarRepo, maxTokens, eventFlowRepo, patternTemplateRepo } = deps;
  const allUnits = codeUnitRepo.findAll();
  const patternsByType = groupPatternsByType(allUnits);
  const envVars = envVarRepo.findAll();

  const sections: Section[] = [];

  // API Endpoints
  const apiEndpoints = patternsByType.get(PatternType.API_ENDPOINT);
  if (apiEndpoints && apiEndpoints.length > 0) {
    const lines: string[] = ['## API Endpoints'];
    for (const entry of apiEndpoints) {
      lines.push(`- ${entry.patternValue} - ${entry.filePath}:${entry.functionName}`);
    }
    lines.push('');
    sections.push({ content: lines.join('\n'), score: apiEndpoints.length });
  }

  // Database Operations
  const dbReads = patternsByType.get(PatternType.DATABASE_READ) ?? [];
  const dbWrites = patternsByType.get(PatternType.DATABASE_WRITE) ?? [];
  if (dbReads.length > 0 || dbWrites.length > 0) {
    const lines: string[] = ['## Database Operations'];
    if (dbReads.length > 0) {
      lines.push('### Reads');
      for (const entry of dbReads) {
        lines.push(
          `- ${entry.patternValue} - ${entry.filePath}:${entry.functionName}`,
        );
      }
    }
    if (dbWrites.length > 0) {
      lines.push('### Writes');
      for (const entry of dbWrites) {
        lines.push(
          `- ${entry.patternValue} - ${entry.filePath}:${entry.functionName}`,
        );
      }
    }
    lines.push('');
    sections.push({ content: lines.join('\n'), score: dbReads.length + dbWrites.length });
  }

  // External Services
  const externalServices = patternsByType.get(PatternType.EXTERNAL_SERVICE);
  if (externalServices && externalServices.length > 0) {
    const lines: string[] = ['## External Services'];
    for (const entry of externalServices) {
      lines.push(`- ${entry.patternValue} - ${entry.filePath}:${entry.functionName}`);
    }
    lines.push('');
    sections.push({ content: lines.join('\n'), score: externalServices.length });
  }

  // API Calls
  const apiCalls = patternsByType.get(PatternType.API_CALL);
  if (apiCalls && apiCalls.length > 0) {
    const lines: string[] = ['## API Calls'];
    for (const entry of apiCalls) {
      lines.push(`- ${entry.patternValue} - ${entry.filePath}:${entry.functionName}`);
    }
    lines.push('');
    sections.push({ content: lines.join('\n'), score: apiCalls.length });
  }

  // Environment Variables
  if (envVars.length > 0) {
    const lines: string[] = ['## Environment Variables'];
    for (const envVar of envVars) {
      const desc = envVar.description ? ` - ${envVar.description}` : '';
      lines.push(`- ${envVar.name}${desc}`);
    }
    lines.push('');
    sections.push({ content: lines.join('\n'), score: envVars.length });
  }

  // Event Flows
  if (eventFlowRepo) {
    const eventFlowSection = buildEventFlowSection(eventFlowRepo, codeUnitRepo);
    if (eventFlowSection) {
      sections.push(eventFlowSection);
    }
  }

  const patternsOutput = fitSections('# Patterns\n\n', sections, maxTokens);

  // Conventions (Pattern Templates)
  const conventionSections = buildConventionSections(codeUnitRepo, patternTemplateRepo);
  if (conventionSections.length === 0) {
    return patternsOutput;
  }

  const remainingTokens = maxTokens - estimateTokens(patternsOutput);
  if (remainingTokens <= 0) {
    return patternsOutput;
  }

  const conventionHeader = '\n## Conventions (Recurring Pattern Combinations)\n\n';
  const conventionOutput = fitSections(conventionHeader, conventionSections, remainingTokens);

  // Only append if at least one convention was included (not just the header)
  if (conventionOutput === conventionHeader) {
    return patternsOutput;
  }

  return patternsOutput + conventionOutput;
}

function buildEventFlowSection(
  eventFlowRepo: IEventFlowRepository,
  codeUnitRepo: ICodeUnitRepository,
): Section | undefined {
  const allFlows = eventFlowRepo.findAll();
  if (allFlows.length === 0) {
    return undefined;
  }

  const emitters: EventFlow[] = [];
  const subscribers: EventFlow[] = [];

  for (const flow of allFlows) {
    if (flow.direction === 'emit') {
      emitters.push(flow);
    } else {
      subscribers.push(flow);
    }
  }

  const lines: string[] = ['## Event Flows'];

  if (emitters.length > 0) {
    lines.push('### Emitters');
    for (const flow of emitters) {
      const unit = codeUnitRepo.findById(flow.codeUnitId);
      if (!unit) continue;
      lines.push(`- \`${flow.eventName}\` (${flow.framework}) - ${unit.filePath}:${unit.name}`);
    }
  }

  if (subscribers.length > 0) {
    lines.push('### Subscribers');
    for (const flow of subscribers) {
      const unit = codeUnitRepo.findById(flow.codeUnitId);
      if (!unit) continue;
      lines.push(`- \`${flow.eventName}\` (${flow.framework}) - ${unit.filePath}:${unit.name}`);
    }
  }

  // If all flows referenced unknown units, we may have only the header
  if (lines.length <= 1) {
    return undefined;
  }

  lines.push('');
  return { content: lines.join('\n'), score: allFlows.length };
}

/**
 * Build scored sections for pattern template conventions.
 * Each template becomes a section scored by follower count (most common first).
 */
function buildConventionSections(
  codeUnitRepo: ICodeUnitRepository,
  patternTemplateRepo?: IPatternTemplateRepository,
): Section[] {
  if (!patternTemplateRepo) {
    return [];
  }

  const allTemplates = patternTemplateRepo.findAll();
  if (allTemplates.length === 0) {
    return [];
  }

  return allTemplates.map(({ template }) => {
    const lines: string[] = [];
    lines.push(`### ${template.name} (${template.followerCount} implementations)`);

    // Look up template code unit for line range
    const unit = codeUnitRepo.findById(template.templateUnitId);
    if (unit) {
      lines.push(`Template: ${template.templateFilePath} (lines ${unit.lineStart}-${unit.lineEnd})`);
    } else {
      lines.push(`Template: ${template.templateFilePath}`);
    }

    if (template.conventions.length > 0) {
      lines.push('Conventions:');
      for (const convention of template.conventions) {
        lines.push(`- ${convention}`);
      }
    }

    lines.push('');
    return { content: lines.join('\n'), score: template.followerCount };
  });
}

function groupPatternsByType(units: CodeUnit[]): Map<PatternType, PatternEntry[]> {
  const groups = new Map<PatternType, PatternEntry[]>();

  for (const unit of units) {
    for (const pattern of unit.patterns) {
      const entries = groups.get(pattern.patternType) ?? [];
      entries.push({
        patternValue: pattern.patternValue,
        filePath: unit.filePath,
        functionName: unit.name,
      });
      groups.set(pattern.patternType, entries);
    }
  }

  return groups;
}
