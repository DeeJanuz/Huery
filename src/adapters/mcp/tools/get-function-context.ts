/**
 * MCP tool: get-function-context
 * Aggregated view of a single function — everything an LLM needs about it.
 */

import type {
  ICodeUnitRepository,
  IFunctionCallRepository,
  ITypeFieldRepository,
  IEventFlowRepository,
  IFileSystem,
} from '@/domain/ports/index.js';
import type { CodeUnit } from '@/domain/models/index.js';
import { buildToolResponse, buildErrorResponse } from '../response-builder.js';
import type { ToolDefinition, ToolHandler } from '../tool-registry.js';
import { extractSourceForUnit } from '../source-extractor.js';

interface Dependencies {
  codeUnitRepo: ICodeUnitRepository;
  functionCallRepo: IFunctionCallRepository;
  typeFieldRepo: ITypeFieldRepository;
  eventFlowRepo: IEventFlowRepository;
  fileSystem?: IFileSystem;
}

export function createGetFunctionContextTool(deps: Dependencies): {
  definition: ToolDefinition;
  handler: ToolHandler;
} {
  const definition: ToolDefinition = {
    name: 'get-function-context',
    description:
      'Complete context for a function: signature, calls, callers, events, types.',
    inputSchema: {
      type: 'object',
      properties: {
        unit_id: {
          type: 'string',
          description: 'Code unit ID',
        },
        function_name: {
          type: 'string',
          description: 'Function name (alternative to unit_id)',
        },
        file_path: {
          type: 'string',
          description: 'File path to disambiguate function_name',
        },
        include_source: {
          type: 'boolean',
          description: 'Include source code for the function and its callers/callees (default: false)',
        },
      },
    },
  };

  const handler: ToolHandler = async (args: Record<string, unknown>) => {
    const unitId = args.unit_id as string | undefined;
    const functionName = args.function_name as string | undefined;
    const filePath = args.file_path as string | undefined;
    const includeSource = args.include_source === true;

    if (!unitId && !functionName) {
      return buildErrorResponse(
        'Either unit_id or function_name must be provided.',
      );
    }

    let unit: CodeUnit | undefined;

    if (unitId) {
      unit = deps.codeUnitRepo.findById(unitId);
      if (!unit) {
        return buildErrorResponse(`Code unit with id "${unitId}" not found.`);
      }
    } else if (functionName) {
      let matches = deps.codeUnitRepo
        .findAll()
        .filter((u) => u.name === functionName);

      if (filePath) {
        matches = matches.filter((u) => u.filePath === filePath);
      }

      if (matches.length === 0) {
        return buildErrorResponse(
          `No code unit with name "${functionName}" not found.`,
        );
      }
      unit = matches[0];
    }

    // Outgoing calls (this unit calls others)
    const outgoingCalls = deps.functionCallRepo
      .findByCallerUnitId(unit!.id)
      .map((call) => ({
        calleeName: call.calleeName,
        calleeFilePath: call.calleeFilePath,
        calleeUnitId: call.calleeUnitId,
        isAsync: call.isAsync,
        lineNumber: call.lineNumber,
      }));

    // Incoming calls (others call this unit)
    const byUnitId = deps.functionCallRepo.findByCalleeUnitId(unit!.id);
    const byName = deps.functionCallRepo.findByCalleeName(unit!.name);

    // Deduplicate
    const seenCallIds = new Set<string>();
    const incomingCallsRaw = [...byUnitId, ...byName].filter((call) => {
      if (seenCallIds.has(call.id)) return false;
      seenCallIds.add(call.id);
      return true;
    });

    const unitMap = new Map(
      deps.codeUnitRepo.findAll().map((u) => [u.id, u]),
    );

    const incomingCalls = incomingCallsRaw.map((call) => {
      const callerUnit = unitMap.get(call.callerUnitId);
      return {
        callerName: callerUnit?.name ?? call.callerUnitId,
        callerFilePath: callerUnit?.filePath,
        callerUnitId: call.callerUnitId,
        isAsync: call.isAsync,
        lineNumber: call.lineNumber,
      };
    });

    // Event flows
    const eventFlows = deps.eventFlowRepo
      .findByCodeUnitId(unit!.id)
      .map((flow) => ({
        eventName: flow.eventName,
        direction: flow.direction,
        framework: flow.framework,
        lineNumber: flow.lineNumber,
      }));

    // Type fields
    const typeFields = deps.typeFieldRepo
      .findByParentUnitId(unit!.id)
      .map((field) => ({
        name: field.name,
        fieldType: field.fieldType,
        isOptional: field.isOptional,
        isReadonly: field.isReadonly,
        lineNumber: field.lineNumber,
      }));

    const unitData: Record<string, unknown> = {
      id: unit!.id,
      name: unit!.name,
      unitType: unit!.unitType,
      filePath: unit!.filePath,
      lineStart: unit!.lineStart,
      lineEnd: unit!.lineEnd,
      signature: unit!.signature,
      isAsync: unit!.isAsync,
      isExported: unit!.isExported,
      language: unit!.language,
      complexityScore: unit!.complexityScore,
    };

    let outgoingCallsData: Record<string, unknown>[] = outgoingCalls;
    let incomingCallsData: Record<string, unknown>[] = incomingCalls;

    if (includeSource && deps.fileSystem) {
      // Source for the target unit
      unitData.source = await extractSourceForUnit(deps.fileSystem, {
        filePath: unit!.filePath,
        lineStart: unit!.lineStart,
        lineEnd: unit!.lineEnd,
      });

      // Source for callee units (outgoing calls)
      outgoingCallsData = await Promise.all(
        outgoingCalls.map(async (call) => {
          const calleeUnit = call.calleeUnitId
            ? unitMap.get(call.calleeUnitId)
            : undefined;
          const source = calleeUnit
            ? await extractSourceForUnit(deps.fileSystem!, {
                filePath: calleeUnit.filePath,
                lineStart: calleeUnit.lineStart,
                lineEnd: calleeUnit.lineEnd,
              })
            : null;
          return { ...call, source };
        }),
      );

      // Source for caller units (incoming calls)
      incomingCallsData = await Promise.all(
        incomingCalls.map(async (call) => {
          const callerUnit = unitMap.get(call.callerUnitId);
          const source = callerUnit
            ? await extractSourceForUnit(deps.fileSystem!, {
                filePath: callerUnit.filePath,
                lineStart: callerUnit.lineStart,
                lineEnd: callerUnit.lineEnd,
              })
            : null;
          return { ...call, source };
        }),
      );
    }

    const data = {
      unit: unitData,
      outgoingCalls: outgoingCallsData,
      incomingCalls: incomingCallsData,
      eventFlows,
      typeFields,
    };

    return buildToolResponse(data);
  };

  return { definition, handler };
}
