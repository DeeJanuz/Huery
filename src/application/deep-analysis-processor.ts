/**
 * Deep Analysis Processor
 *
 * Runs deep extractors (function calls, type fields, event flows, schema models,
 * guards) over cached code unit bodies and file contents, then stores results
 * via repository ports.
 *
 * This is a pure orchestration function — extractors are stateless, and storage
 * is delegated to injected repository interfaces.
 */

import type { CodeUnit } from '@/domain/models/index.js';
import { createFunctionCall, createTypeField, createEventFlow, createSchemaModel, createSchemaModelField, createGuardClause, createFileCluster, createFileClusterMember, createPatternTemplate, createPatternTemplateFollower } from '@/domain/models/index.js';
import { CodeUnitType } from '@/domain/models/index.js';
import type { IFunctionCallRepository, ITypeFieldRepository, IEventFlowRepository, ISchemaModelRepository, IGuardClauseRepository, IFileDependencyRepository, IFileClusterRepository, IPatternTemplateRepository, ICodeUnitRepository } from '@/domain/ports/index.js';
import { detectPatternTemplates } from './pattern-templates/template-analyzer.js';
import { resolveCallees } from './callee-resolver.js';
import { extractFunctionCalls } from '@/extraction/call-graph-extractor.js';
import { extractTypeFields } from '@/extraction/type-field-extractor.js';
import { extractEventFlows } from '@/extraction/event-flow-extractor.js';
import { extractSchemaModels } from '@/extraction/schema-model-extractor.js';
import { extractGuards } from '@/extraction/guard-extractor.js';
import { computeFileClusters } from './clustering/import-graph-cluster.js';
import type { FileProcessingResult } from './file-processor.js';

export interface DeepAnalysisDependencies {
  readonly functionCallRepo: IFunctionCallRepository;
  readonly typeFieldRepo: ITypeFieldRepository;
  readonly eventFlowRepo: IEventFlowRepository;
  readonly schemaModelRepo: ISchemaModelRepository;
  readonly guardClauseRepo?: IGuardClauseRepository;
  readonly dependencyRepo?: IFileDependencyRepository;
  readonly fileClusterRepo?: IFileClusterRepository;
  readonly codeUnitRepo?: ICodeUnitRepository;
  readonly patternTemplateRepo?: IPatternTemplateRepository;
}

export interface DeepAnalysisResult {
  readonly functionCallsExtracted: number;
  readonly typeFieldsExtracted: number;
  readonly eventFlowsExtracted: number;
  readonly schemaModelsExtracted: number;
  readonly guardsExtracted: number;
  readonly clustersComputed: number;
  readonly templatesDetected: number;
  readonly calleesResolved: number;
}

/**
 * Unit types that should have function call and event flow extraction.
 */
const CALLABLE_UNIT_TYPES = new Set<CodeUnitType>([
  CodeUnitType.FUNCTION,
  CodeUnitType.ARROW_FUNCTION,
  CodeUnitType.METHOD,
]);

/**
 * Unit types that should have type field extraction.
 */
const TYPE_UNIT_TYPES = new Set<CodeUnitType>([
  CodeUnitType.CLASS,
  CodeUnitType.INTERFACE,
  CodeUnitType.TYPE_ALIAS,
  CodeUnitType.STRUCT,
  CodeUnitType.ENUM,
]);

/**
 * Process deep analysis over file processing results and file contents.
 *
 * For each code unit (including children), runs the appropriate extractors
 * based on unit type and stores results via repositories. Schema models
 * are extracted from full file contents independently.
 *
 * @param fileResults - Results from the file processing pipeline
 * @param fileContents - Map of filePath to full file content (for schema extraction)
 * @param deps - Repository dependencies for storing extracted data
 * @returns Counts of all extracted items
 */
export function processDeepAnalysis(
  fileResults: FileProcessingResult[],
  fileContents: Map<string, string>,
  deps: DeepAnalysisDependencies,
  onStep?: (stepName: string, detail?: string) => void,
): DeepAnalysisResult {
  let functionCallsExtracted = 0;
  let typeFieldsExtracted = 0;
  let eventFlowsExtracted = 0;
  let guardsExtracted = 0;
  let schemaModelsExtracted = 0;

  // Process each file's code units
  onStep?.('function calls & type fields');
  let lastStepTime = Date.now();
  for (let i = 0; i < fileResults.length; i++) {
    const fileResult = fileResults[i];
    const allFunctionCalls: ReturnType<typeof createFunctionCall>[] = [];
    const allTypeFields: ReturnType<typeof createTypeField>[] = [];
    const allEventFlows: ReturnType<typeof createEventFlow>[] = [];
    const allGuardClauses: ReturnType<typeof createGuardClause>[] = [];

    for (const unit of fileResult.codeUnits) {
      processUnit(
        unit,
        fileResult.bodiesByUnitId,
        allFunctionCalls,
        allTypeFields,
        allEventFlows,
        allGuardClauses,
      );
    }

    // Batch save per file
    if (allFunctionCalls.length > 0) {
      deps.functionCallRepo.saveBatch(allFunctionCalls);
      functionCallsExtracted += allFunctionCalls.length;
    }
    if (allTypeFields.length > 0) {
      deps.typeFieldRepo.saveBatch(allTypeFields);
      typeFieldsExtracted += allTypeFields.length;
    }
    if (allEventFlows.length > 0) {
      deps.eventFlowRepo.saveBatch(allEventFlows);
      eventFlowsExtracted += allEventFlows.length;
    }
    if (allGuardClauses.length > 0 && deps.guardClauseRepo) {
      deps.guardClauseRepo.saveBatch(allGuardClauses);
      guardsExtracted += allGuardClauses.length;
    }

    // Throttled progress within this block
    if (onStep) {
      const now = Date.now();
      if (now - lastStepTime >= 80) {
        lastStepTime = now;
        onStep('function calls & type fields', `${i + 1}/${fileResults.length}`);
      }
    }
  }
  // Always emit final state for this block
  if (fileResults.length > 0) {
    onStep?.('function calls & type fields', `${fileResults.length}/${fileResults.length}`);
  }

  // Extract schema models from file contents
  onStep?.('schema models');
  for (const [filePath, content] of fileContents) {
    const extractedModels = extractSchemaModels(content, filePath);
    for (const extracted of extractedModels) {
      const modelId = createSchemaModel({
        name: extracted.name,
        filePath,
        framework: extracted.framework,
        tableName: extracted.tableName,
      }).id;

      const fields = extracted.fields.map(f =>
        createSchemaModelField({
          modelId,
          name: f.name,
          fieldType: f.fieldType,
          isPrimaryKey: f.isPrimaryKey,
          isRequired: f.isRequired,
          isUnique: f.isUnique,
          hasDefault: f.hasDefault,
          relationTarget: f.relationTarget,
        }),
      );

      const model = createSchemaModel({
        id: modelId,
        name: extracted.name,
        filePath,
        framework: extracted.framework,
        tableName: extracted.tableName,
        fields,
      });

      deps.schemaModelRepo.save(model);
      schemaModelsExtracted++;
    }
  }

  // Compute file clusters from dependency graph
  onStep?.('file clustering');
  let clustersComputed = 0;
  if (deps.fileClusterRepo && deps.dependencyRepo) {
    const fileDeps = deps.dependencyRepo.findAll();
    const clusters = computeFileClusters(fileDeps);

    if (clusters.length > 0) {
      deps.fileClusterRepo.clear();

      const mapped = clusters.map(cluster => ({
        cluster: createFileCluster({
          id: cluster.id,
          name: cluster.name,
          cohesion: cluster.cohesion,
          internalEdges: cluster.internalEdges,
          externalEdges: cluster.externalEdges,
        }),
        members: cluster.files.map(filePath =>
          createFileClusterMember({
            clusterId: cluster.id,
            filePath,
            isEntryPoint: cluster.entryPoints.includes(filePath),
          }),
        ),
      }));

      deps.fileClusterRepo.saveBatch(mapped);
      clustersComputed = clusters.length;
    }
  }

  // Detect pattern templates from all code units
  onStep?.('pattern templates');
  let templatesDetected = 0;
  if (deps.patternTemplateRepo && deps.codeUnitRepo) {
    const allCodeUnits = deps.codeUnitRepo.findAll();
    const templates = detectPatternTemplates(allCodeUnits);

    deps.patternTemplateRepo.clear();

    if (templates.length > 0) {
      const mapped = templates.map(t => ({
        template: createPatternTemplate({
          id: t.id,
          name: t.name,
          description: t.description,
          patternTypes: t.patternTypes,
          templateUnitId: t.templateUnitId,
          templateFilePath: t.templateFilePath,
          followerCount: t.followerCount,
          conventions: t.conventions,
        }),
        followers: t.followers.map(f =>
          createPatternTemplateFollower({
            templateId: t.id,
            filePath: f.filePath,
            unitName: f.unitName,
          }),
        ),
      }));

      deps.patternTemplateRepo.saveBatch(mapped);
      templatesDetected = templates.length;
    }
  }

  // Resolve callee names to code unit records
  onStep?.('callee resolution');
  let calleesResolved = 0;
  if (deps.codeUnitRepo) {
    const resolution = resolveCallees({
      codeUnitRepo: deps.codeUnitRepo,
      functionCallRepo: deps.functionCallRepo,
    });
    calleesResolved = resolution.resolved;
  }

  return {
    functionCallsExtracted,
    typeFieldsExtracted,
    eventFlowsExtracted,
    schemaModelsExtracted,
    guardsExtracted,
    clustersComputed,
    templatesDetected,
    calleesResolved,
  };
}

/**
 * Build a condition string from an extracted guard.
 * Combines condition and errorType fields into a single string for persistence.
 */
function buildGuardCondition(guard: { condition?: string; errorType?: string; guardType: string }): string {
  if (guard.condition) return guard.condition;
  if (guard.errorType) return guard.errorType;
  return guard.guardType;
}

/**
 * Process a single code unit and its children recursively.
 * Appends domain objects to the provided arrays for batch saving.
 */
function processUnit(
  unit: CodeUnit,
  bodiesByUnitId: Map<string, string>,
  functionCalls: ReturnType<typeof createFunctionCall>[],
  typeFields: ReturnType<typeof createTypeField>[],
  eventFlows: ReturnType<typeof createEventFlow>[],
  guardClauses: ReturnType<typeof createGuardClause>[],
): void {
  const body = bodiesByUnitId.get(unit.id);

  if (body) {
    // Function calls + event flows + guards for callable units
    if (CALLABLE_UNIT_TYPES.has(unit.unitType)) {
      const calls = extractFunctionCalls(body);
      for (const call of calls) {
        functionCalls.push(createFunctionCall({
          callerUnitId: unit.id,
          calleeName: call.calleeName,
          lineNumber: call.lineNumber,
          isAsync: call.isAsync,
        }));
      }

      const flows = extractEventFlows(body);
      for (const flow of flows) {
        // Skip flows without a named event (e.g. RxJS .subscribe(), Redux .dispatch())
        if (!flow.eventName) continue;
        eventFlows.push(createEventFlow({
          codeUnitId: unit.id,
          eventName: flow.eventName,
          direction: flow.direction,
          framework: flow.framework,
          lineNumber: flow.lineNumber,
        }));
      }

      const extractedGuards = extractGuards(body);
      for (const guard of extractedGuards) {
        guardClauses.push(createGuardClause({
          codeUnitId: unit.id,
          guardType: guard.guardType,
          condition: buildGuardCondition(guard),
          lineNumber: guard.lineNumber,
        }));
      }
    }

    // Type fields for type-like units
    if (TYPE_UNIT_TYPES.has(unit.unitType)) {
      const fields = extractTypeFields(body);
      for (const field of fields) {
        typeFields.push(createTypeField({
          parentUnitId: unit.id,
          name: field.name,
          fieldType: field.fieldType,
          isOptional: field.isOptional,
          isReadonly: field.isReadonly,
          lineNumber: field.lineNumber,
        }));
      }
    }
  }

  // Process children recursively
  for (const child of unit.children) {
    processUnit(child, bodiesByUnitId, functionCalls, typeFields, eventFlows, guardClauses);
  }
}
