import { describe, it, expect, beforeEach } from 'vitest';
import { createGetFunctionContextTool } from '@/adapters/mcp/tools/get-function-context.js';
import {
  InMemoryCodeUnitRepository,
  InMemoryFunctionCallRepository,
  InMemoryTypeFieldRepository,
  InMemoryEventFlowRepository,
  InMemoryFileSystem,
} from '../../../../tests/helpers/fakes/index.js';
import {
  createCodeUnit,
  CodeUnitType,
  createFunctionCall,
  createTypeField,
  createEventFlow,
} from '@/domain/models/index.js';

describe('get-function-context tool', () => {
  let codeUnitRepo: InMemoryCodeUnitRepository;
  let functionCallRepo: InMemoryFunctionCallRepository;
  let typeFieldRepo: InMemoryTypeFieldRepository;
  let eventFlowRepo: InMemoryEventFlowRepository;
  let handler: ReturnType<typeof createGetFunctionContextTool>['handler'];

  const unitA = createCodeUnit({
    id: 'unit-a',
    filePath: 'src/services/order.ts',
    name: 'processOrder',
    unitType: CodeUnitType.FUNCTION,
    lineStart: 10,
    lineEnd: 30,
    isAsync: true,
    isExported: true,
    language: 'typescript',
    signature: 'async function processOrder(order: Order): Promise<void>',
    complexityScore: 25,
  });

  const unitB = createCodeUnit({
    id: 'unit-b',
    filePath: 'src/services/validation.ts',
    name: 'validateOrder',
    unitType: CodeUnitType.FUNCTION,
    lineStart: 5,
    lineEnd: 20,
    isAsync: false,
    isExported: true,
    language: 'typescript',
  });

  const unitC = createCodeUnit({
    id: 'unit-c',
    filePath: 'src/handlers/api.ts',
    name: 'handleRequest',
    unitType: CodeUnitType.FUNCTION,
    lineStart: 1,
    lineEnd: 40,
    isAsync: true,
    isExported: true,
    language: 'typescript',
  });

  const unitD = createCodeUnit({
    id: 'unit-d',
    filePath: 'src/models/order.ts',
    name: 'OrderInterface',
    unitType: CodeUnitType.INTERFACE,
    lineStart: 1,
    lineEnd: 15,
    isAsync: false,
    isExported: true,
    language: 'typescript',
  });

  beforeEach(() => {
    codeUnitRepo = new InMemoryCodeUnitRepository();
    functionCallRepo = new InMemoryFunctionCallRepository();
    typeFieldRepo = new InMemoryTypeFieldRepository();
    eventFlowRepo = new InMemoryEventFlowRepository();
    const tool = createGetFunctionContextTool({
      codeUnitRepo,
      functionCallRepo,
      typeFieldRepo,
      eventFlowRepo,
    });
    handler = tool.handler;

    codeUnitRepo.save(unitA);
    codeUnitRepo.save(unitB);
    codeUnitRepo.save(unitC);
    codeUnitRepo.save(unitD);

    // processOrder calls validateOrder (outgoing)
    functionCallRepo.save(createFunctionCall({
      callerUnitId: 'unit-a',
      calleeName: 'validateOrder',
      calleeUnitId: 'unit-b',
      lineNumber: 12,
      isAsync: false,
    }));

    // handleRequest calls processOrder (incoming to processOrder)
    functionCallRepo.save(createFunctionCall({
      callerUnitId: 'unit-c',
      calleeName: 'processOrder',
      calleeUnitId: 'unit-a',
      lineNumber: 15,
      isAsync: true,
    }));

    // processOrder emits an event
    eventFlowRepo.save(createEventFlow({
      codeUnitId: 'unit-a',
      eventName: 'order-placed',
      direction: 'emit',
      framework: 'node-events',
      lineNumber: 25,
    }));

    // OrderInterface has type fields
    typeFieldRepo.save(createTypeField({
      parentUnitId: 'unit-d',
      name: 'orderId',
      fieldType: 'string',
      isOptional: false,
      isReadonly: true,
      lineNumber: 3,
    }));
    typeFieldRepo.save(createTypeField({
      parentUnitId: 'unit-d',
      name: 'total',
      fieldType: 'number',
      isOptional: false,
      isReadonly: false,
      lineNumber: 4,
    }));
  });

  it('should have correct tool definition', () => {
    const tool = createGetFunctionContextTool({
      codeUnitRepo,
      functionCallRepo,
      typeFieldRepo,
      eventFlowRepo,
    });
    expect(tool.definition.name).toBe('get-function-context');
    expect(tool.definition.inputSchema).toBeDefined();
  });

  it('should return full context for a function by unit_id', async () => {
    const result = await handler({ unit_id: 'unit-a' });
    const parsed = JSON.parse(result.content[0].text);

    // Unit info
    expect(parsed.data.unit.name).toBe('processOrder');
    expect(parsed.data.unit.unitType).toBe('FUNCTION');
    expect(parsed.data.unit.filePath).toBe('src/services/order.ts');
    expect(parsed.data.unit.signature).toBe('async function processOrder(order: Order): Promise<void>');
    expect(parsed.data.unit.isAsync).toBe(true);
    expect(parsed.data.unit.isExported).toBe(true);
    expect(parsed.data.unit.complexityScore).toBe(25);

    // Outgoing calls
    expect(parsed.data.outgoingCalls).toHaveLength(1);
    expect(parsed.data.outgoingCalls[0].calleeName).toBe('validateOrder');
    expect(parsed.data.outgoingCalls[0].isAsync).toBe(false);

    // Incoming calls
    expect(parsed.data.incomingCalls).toHaveLength(1);
    expect(parsed.data.incomingCalls[0].callerName).toBe('handleRequest');
    expect(parsed.data.incomingCalls[0].callerFilePath).toBe('src/handlers/api.ts');

    // Event flows
    expect(parsed.data.eventFlows).toHaveLength(1);
    expect(parsed.data.eventFlows[0].eventName).toBe('order-placed');
    expect(parsed.data.eventFlows[0].direction).toBe('emit');

    // Type fields empty for a function
    expect(parsed.data.typeFields).toHaveLength(0);

  });

  it('should return full context for a function by function_name', async () => {
    const result = await handler({ function_name: 'processOrder' });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.data.unit.name).toBe('processOrder');
    expect(parsed.data.outgoingCalls).toHaveLength(1);
    expect(parsed.data.incomingCalls).toHaveLength(1);
  });

  it('should disambiguate function_name with file_path', async () => {
    // Add another function with the same name in a different file
    codeUnitRepo.save(createCodeUnit({
      id: 'unit-dup',
      filePath: 'src/other/order.ts',
      name: 'processOrder',
      unitType: CodeUnitType.FUNCTION,
      lineStart: 1,
      lineEnd: 10,
      isAsync: false,
      isExported: false,
      language: 'typescript',
    }));

    const result = await handler({ function_name: 'processOrder', file_path: 'src/services/order.ts' });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.data.unit.filePath).toBe('src/services/order.ts');
    expect(parsed.data.unit.isAsync).toBe(true);
  });

  it('should return type fields for interface/class', async () => {
    const result = await handler({ unit_id: 'unit-d' });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.data.unit.name).toBe('OrderInterface');
    expect(parsed.data.typeFields).toHaveLength(2);
    expect(parsed.data.typeFields[0].name).toBe('orderId');
    expect(parsed.data.typeFields[0].fieldType).toBe('string');
    expect(parsed.data.typeFields[1].name).toBe('total');
  });

  it('should return error when neither unit_id nor function_name provided', async () => {
    const result = await handler({});

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('unit_id');
  });

  it('should return error when unit_id not found', async () => {
    const result = await handler({ unit_id: 'nonexistent' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('not found');
  });

  it('should return error when function_name not found', async () => {
    const result = await handler({ function_name: 'nonexistent' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('not found');
  });

  it('should return empty collections when function has no calls or events', async () => {
    const result = await handler({ unit_id: 'unit-b' });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.data.unit.name).toBe('validateOrder');
    expect(parsed.data.outgoingCalls).toHaveLength(0);
    // validateOrder is called by processOrder
    expect(parsed.data.incomingCalls).toHaveLength(1);
    expect(parsed.data.eventFlows).toHaveLength(0);
    expect(parsed.data.typeFields).toHaveLength(0);
  });

  describe('include_source', () => {
    let fileSystem: InMemoryFileSystem;

    beforeEach(async () => {
      fileSystem = new InMemoryFileSystem();
      // Write file content matching the code units
      const orderLines = Array.from({ length: 30 }, (_, i) => `order-line-${i + 1}`);
      await fileSystem.writeFile('src/services/order.ts', orderLines.join('\n'));

      const validationLines = Array.from({ length: 20 }, (_, i) => `validation-line-${i + 1}`);
      await fileSystem.writeFile('src/services/validation.ts', validationLines.join('\n'));

      const apiLines = Array.from({ length: 40 }, (_, i) => `api-line-${i + 1}`);
      await fileSystem.writeFile('src/handlers/api.ts', apiLines.join('\n'));

      const tool = createGetFunctionContextTool({
        codeUnitRepo,
        functionCallRepo,
        typeFieldRepo,
        eventFlowRepo,
        fileSystem,
      });
      handler = tool.handler;
    });

    it('should include source for the target unit when include_source is true', async () => {
      const result = await handler({ unit_id: 'unit-a', include_source: true });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.data.unit.source).toBeDefined();
      expect(parsed.data.unit.source).toContain('order-line-10');
      expect(parsed.data.unit.source).toContain('order-line-30');
    });

    it('should include source for callee units in outgoing calls', async () => {
      const result = await handler({ unit_id: 'unit-a', include_source: true });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.data.outgoingCalls).toHaveLength(1);
      expect(parsed.data.outgoingCalls[0].source).toBeDefined();
      expect(parsed.data.outgoingCalls[0].source).toContain('validation-line-5');
    });

    it('should include source for caller units in incoming calls', async () => {
      const result = await handler({ unit_id: 'unit-a', include_source: true });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.data.incomingCalls).toHaveLength(1);
      expect(parsed.data.incomingCalls[0].source).toBeDefined();
      expect(parsed.data.incomingCalls[0].source).toContain('api-line-1');
    });

    it('should not include source when include_source is false', async () => {
      const result = await handler({ unit_id: 'unit-a', include_source: false });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.data.unit).not.toHaveProperty('source');
      expect(parsed.data.outgoingCalls[0]).not.toHaveProperty('source');
      expect(parsed.data.incomingCalls[0]).not.toHaveProperty('source');
    });

    it('should not include source when include_source is omitted', async () => {
      const result = await handler({ unit_id: 'unit-a' });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.data.unit).not.toHaveProperty('source');
    });
  });
});
