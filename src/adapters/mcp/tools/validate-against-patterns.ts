/**
 * MCP tool: validate-against-patterns
 * Validates a new or modified file against the codebase's established patterns.
 * Reads the file, runs extractors on it, and compares against pattern templates.
 */

import type { IFileSystem, IPatternTemplateRepository, ICodeUnitRepository, IFileAnalyzer } from '@/domain/ports/index.js';
import { buildToolResponse, buildErrorResponse } from '../response-builder.js';
import type { ToolDefinition, ToolHandler } from '../tool-registry.js';

interface Dependencies {
  fileSystem: IFileSystem;
  patternTemplateRepo: IPatternTemplateRepository;
  codeUnitRepo: ICodeUnitRepository;
  fileAnalyzer?: IFileAnalyzer;
}

interface ExtractedUnitInfo {
  name: string;
  unitType: string;
  lineStart: number;
  lineEnd: number;
  patterns: Array<{ patternType: string; patternValue: string }>;
}

interface MatchedPatternInfo {
  name: string;
  conventions: string[];
  templateFilePath: string;
}

interface ValidationAnalysis {
  followsConventions: string[];
  deviations: string[];
  suggestions: string[];
}

interface SimilarFileInfo {
  filePath: string;
  unitName: string;
}

export function createValidateAgainstPatternsTool(deps: Dependencies): {
  definition: ToolDefinition;
  handler: ToolHandler;
} {
  const definition: ToolDefinition = {
    name: 'validate-against-patterns',
    description:
      'Validate a new or modified file against established codebase patterns. Extracts code units from the file and compares against pattern templates to identify conventions followed, deviations, and suggestions.',
    inputSchema: {
      type: 'object',
      properties: {
        file_path: {
          type: 'string',
          description: 'Path to the file to validate',
        },
      },
      required: ['file_path'],
    },
  };

  const handler: ToolHandler = async (args: Record<string, unknown>) => {
    const filePath = typeof args.file_path === 'string' ? args.file_path : undefined;

    if (!filePath) {
      return buildErrorResponse('file_path is required');
    }

    // 1. Read the file
    let content: string;
    try {
      content = await deps.fileSystem.readFile(filePath);
    } catch {
      return buildErrorResponse(`Failed to read file: ${filePath}`);
    }

    // 2. If no fileAnalyzer, return graceful degradation response
    if (!deps.fileAnalyzer) {
      return buildToolResponse({
        filePath,
        lineCount: content.split('\n').length,
        extractedUnits: [],
        matchedPatterns: [],
        analysis: {
          followsConventions: [],
          deviations: [],
          suggestions: [],
        },
        similarFiles: [],
        note: 'Real-time extraction is unavailable. Only file metadata is provided.',
      });
    }

    // 3. Run fileAnalyzer
    const processingResult = deps.fileAnalyzer.analyze(filePath, content);

    if (!processingResult || processingResult.codeUnits.length === 0) {
      return buildToolResponse({
        filePath,
        lineCount: content.split('\n').length,
        extractedUnits: [],
        matchedPatterns: [],
        analysis: {
          followsConventions: [],
          deviations: [],
          suggestions: [],
        },
        similarFiles: [],
      });
    }

    // 4. Build extracted units info
    const extractedUnits: ExtractedUnitInfo[] = processingResult.codeUnits.map((unit) => ({
      name: unit.name,
      unitType: unit.unitType,
      lineStart: unit.lineStart,
      lineEnd: unit.lineEnd,
      patterns: unit.patterns.map((p) => ({
        patternType: p.patternType,
        patternValue: p.patternValue,
      })),
    }));

    // 5. Collect all extracted pattern types
    const extractedPatternTypes = new Set<string>();
    for (const unit of processingResult.codeUnits) {
      for (const pattern of unit.patterns) {
        extractedPatternTypes.add(pattern.patternType);
      }
    }

    // 6. Get all pattern templates and match
    const allTemplates = deps.patternTemplateRepo.findAll();
    const matchedPatterns: MatchedPatternInfo[] = [];
    const matchedPatternTypes = new Set<string>();

    for (const { template } of allTemplates) {
      const hasMatch = template.patternTypes.some((pt) => extractedPatternTypes.has(pt));
      if (hasMatch) {
        matchedPatterns.push({
          name: template.name,
          conventions: [...template.conventions],
          templateFilePath: template.templateFilePath,
        });
        for (const pt of template.patternTypes) {
          if (extractedPatternTypes.has(pt)) {
            matchedPatternTypes.add(pt);
          }
        }
      }
    }

    // 7. Build analysis
    const followsConventions: string[] = [];
    for (const mp of matchedPatterns) {
      followsConventions.push(...mp.conventions);
    }

    const deviations: string[] = [];
    for (const pt of extractedPatternTypes) {
      if (!matchedPatternTypes.has(pt)) {
        deviations.push(`Pattern type '${pt}' has no matching template in the codebase`);
      }
    }

    const suggestions: string[] = [];
    if (deviations.length > 0) {
      suggestions.push('Consider creating pattern templates for the unmatched pattern types');
    }
    if (matchedPatterns.length > 0) {
      suggestions.push(
        `Review the canonical examples: ${matchedPatterns.map((mp) => mp.templateFilePath).join(', ')}`,
      );
    }

    const analysis: ValidationAnalysis = {
      followsConventions,
      deviations,
      suggestions,
    };

    // 8. Find similar files by matching pattern types in codeUnitRepo
    const allUnits = deps.codeUnitRepo.findAll();
    const similarFiles: SimilarFileInfo[] = [];
    const seenFilePaths = new Set<string>();

    for (const unit of allUnits) {
      if (similarFiles.length >= 5) break;
      if (unit.filePath === filePath) continue;
      if (seenFilePaths.has(unit.filePath)) continue;

      const hasSharedPattern = unit.patterns.some((p) => extractedPatternTypes.has(p.patternType));
      if (hasSharedPattern) {
        similarFiles.push({
          filePath: unit.filePath,
          unitName: unit.name,
        });
        seenFilePaths.add(unit.filePath);
      }
    }

    return buildToolResponse({
      extractedUnits,
      matchedPatterns,
      analysis,
      similarFiles,
    });
  };

  return { definition, handler };
}
