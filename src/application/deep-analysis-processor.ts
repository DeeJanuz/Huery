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
import { createFunctionCall, createTypeField, createEventFlow, createSchemaModel, createSchemaModelField } from '@/domain/models/index.js';
import { CodeUnitType } from '@/domain/models/index.js';
import type { IFunctionCallRepository, ITypeFieldRepository, IEventFlowRepository, ISchemaModelRepository } from '@/domain/ports/index.js';
import { extractFunctionCalls } from '@/extraction/call-graph-extractor.js';
import { extractTypeFields } from '@/extraction/type-field-extractor.js';
import { extractEventFlows } from '@/extraction/event-flow-extractor.js';
import { extractSchemaModels } from '@/extraction/schema-model-extractor.js';
import { extractGuards } from '@/extraction/guard-extractor.js';
import type { FileProcessingResult } from './file-processor.js';

export interface DeepAnalysisDependencies {
  readonly functionCallRepo: IFunctionCallRepository;
  readonly typeFieldRepo: ITypeFieldRepository;
  readonly eventFlowRepo: IEventFlowRepository;
  readonly schemaModelRepo: ISchemaModelRepository;
}

export interface DeepAnalysisResult {
  readonly functionCallsExtracted: number;
  readonly typeFieldsExtracted: number;
  readonly eventFlowsExtracted: number;
  readonly schemaModelsExtracted: number;
  readonly guardsExtracted: number;
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
): DeepAnalysisResult {
  let functionCallsExtracted = 0;
  let typeFieldsExtracted = 0;
  let eventFlowsExtracted = 0;
  let guardsExtracted = 0;
  let schemaModelsExtracted = 0;

  // Process each file's code units
  for (const fileResult of fileResults) {
    const allFunctionCalls = [];
    const allTypeFields = [];
    const allEventFlows = [];

    for (const unit of fileResult.codeUnits) {
      const counts = processUnit(
        unit,
        fileResult.bodiesByUnitId,
        allFunctionCalls,
        allTypeFields,
        allEventFlows,
      );
      guardsExtracted += counts.guards;
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
  }

  // Extract schema models from file contents
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

  return {
    functionCallsExtracted,
    typeFieldsExtracted,
    eventFlowsExtracted,
    schemaModelsExtracted,
    guardsExtracted,
  };
}

/**
 * Process a single code unit and its children recursively.
 * Appends domain objects to the provided arrays for batch saving.
 *
 * @returns Guard count for this unit and its children
 */
function processUnit(
  unit: CodeUnit,
  bodiesByUnitId: Map<string, string>,
  functionCalls: ReturnType<typeof createFunctionCall>[],
  typeFields: ReturnType<typeof createTypeField>[],
  eventFlows: ReturnType<typeof createEventFlow>[],
): { guards: number } {
  let guards = 0;
  const body = bodiesByUnitId.get(unit.id);

  if (body) {
    // Function calls + event flows for callable units
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
      guards += extractedGuards.length;
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
    const childCounts = processUnit(child, bodiesByUnitId, functionCalls, typeFields, eventFlows);
    guards += childCounts.guards;
  }

  return { guards };
}
