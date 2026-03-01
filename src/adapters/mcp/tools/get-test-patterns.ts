/**
 * MCP tool: get-test-patterns
 * Finds similar code units and discovers their test files, extracting
 * test structure patterns to help LLMs create tests.
 */

import type {
  IFileSystem,
  ICodeUnitRepository,
  IFileClusterRepository,
  IPatternTemplateRepository,
} from '@/domain/ports/index.js';
import type { CodeUnit } from '@/domain/models/index.js';
import { buildToolResponse, buildErrorResponse } from '../response-builder.js';
import type { ToolDefinition, ToolHandler } from '../tool-registry.js';
import { generateTestFileCandidates } from '../test-file-discovery.js';
import type { TestFileCandidate } from '../test-file-discovery.js';
import { findSimilarUnits } from '../similar-units.js';
import { extractTestStructure, determineConventions } from '../test-structure-parser.js';
import type { TestFileResult } from '../test-structure-parser.js';

interface Dependencies {
  fileSystem: IFileSystem;
  codeUnitRepo: ICodeUnitRepository;
  fileClusterRepo?: IFileClusterRepository;
  patternTemplateRepo?: IPatternTemplateRepository;
}

export function createGetTestPatternsTool(deps: Dependencies): {
  definition: ToolDefinition;
  handler: ToolHandler;
} {
  const definition: ToolDefinition = {
    name: 'get-test-patterns',
    description:
      'Find test patterns for a code unit by discovering similar units, locating their test files, and extracting test structure conventions.',
    inputSchema: {
      type: 'object',
      properties: {
        file_path: {
          type: 'string',
          description: 'File path to find test patterns for',
        },
        unit_name: {
          type: 'string',
          description: 'Code unit name to find test patterns for',
        },
      },
    },
  };

  const handler: ToolHandler = async (args: Record<string, unknown>) => {
    const filePath = typeof args.file_path === 'string' ? args.file_path : undefined;
    const unitName = typeof args.unit_name === 'string' ? args.unit_name : undefined;

    if (!filePath && !unitName) {
      return buildErrorResponse('at least one of file_path or unit_name is required');
    }

    // 1. Resolve target unit
    const target = resolveTargetUnit(deps.codeUnitRepo, filePath, unitName);
    if (!target) {
      return buildErrorResponse('Target unit not found');
    }

    // 2. Find similar units
    const allUnits = deps.codeUnitRepo.findAll();
    const similarUnits = findSimilarUnits(target, allUnits, deps.fileClusterRepo);

    // 3. Scan for test files
    const filePaths = new Set<string>();
    const candidates: TestFileCandidate[] = [];

    // Check test files for similar units
    for (const unit of similarUnits) {
      const unitCandidates = generateTestFileCandidates(unit.filePath);
      for (const candidate of unitCandidates) {
        if (!filePaths.has(candidate.testFilePath)) {
          candidates.push(candidate);
          filePaths.add(candidate.testFilePath);
        }
      }
    }

    // Check test files for the target unit itself
    const targetCandidates = generateTestFileCandidates(target.filePath);
    for (const candidate of targetCandidates) {
      if (!filePaths.has(candidate.testFilePath)) {
        candidates.push(candidate);
        filePaths.add(candidate.testFilePath);
      }
    }

    // Filter to only existing test files
    const existingTestFiles: TestFileResult[] = [];
    for (const candidate of candidates) {
      const exists = await deps.fileSystem.exists(candidate.testFilePath);
      if (exists) {
        const source = await deps.fileSystem.readFile(candidate.testFilePath);
        existingTestFiles.push({
          testFilePath: candidate.testFilePath,
          testedFilePath: candidate.testedFilePath,
          source,
        });
        // Limit to first 3 test files
        if (existingTestFiles.length >= 3) break;
      }
    }

    // 4. Extract test structure from found files
    const testStructure = existingTestFiles.length > 0
      ? extractTestStructure(existingTestFiles)
      : null;

    // 5. Determine conventions
    const conventions = determineConventions(existingTestFiles);

    const data = {
      targetUnit: {
        name: target.name,
        filePath: target.filePath,
        unitType: target.unitType,
        signature: target.signature,
      },
      similarUnits: similarUnits.map((u) => ({
        name: u.name,
        filePath: u.filePath,
        unitType: u.unitType,
        signature: u.signature,
      })),
      testFiles: existingTestFiles,
      testStructure,
      conventions,
    };

    return buildToolResponse(data);
  };

  return { definition, handler };
}

function resolveTargetUnit(
  codeUnitRepo: ICodeUnitRepository,
  filePath?: string,
  unitName?: string,
): CodeUnit | undefined {
  if (filePath) {
    const units = codeUnitRepo.findByFilePath(filePath);
    return units[0];
  }
  if (unitName) {
    const allUnits = codeUnitRepo.findAll();
    return allUnits.find((u) => u.name === unitName);
  }
  return undefined;
}

