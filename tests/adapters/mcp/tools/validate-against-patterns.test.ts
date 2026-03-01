import { describe, it, expect, beforeEach } from 'vitest';
import { createValidateAgainstPatternsTool } from '@/adapters/mcp/tools/validate-against-patterns.js';
import {
  InMemoryFileSystem,
  InMemoryPatternTemplateRepository,
  InMemoryCodeUnitRepository,
} from '../../../../tests/helpers/fakes/index.js';
import {
  createCodeUnit,
  CodeUnitType,
  createCodeUnitPattern,
  PatternType,
  createPatternTemplate,
  createPatternTemplateFollower,
} from '@/domain/models/index.js';
import type { IFileAnalyzer } from '@/domain/ports/index.js';

const mockFileAnalyzer: IFileAnalyzer = {
  analyze(filePath: string, _content: string) {
    return {
      filePath,
      codeUnits: [createCodeUnit({
        id: 'extracted-1',
        filePath,
        name: 'extractedFunction',
        unitType: CodeUnitType.FUNCTION,
        lineStart: 1,
        lineEnd: 10,
        isAsync: false,
        isExported: true,
        language: 'typescript',
        patterns: [createCodeUnitPattern({
          codeUnitId: 'extracted-1',
          patternType: PatternType.API_ENDPOINT,
          patternValue: 'GET /api/test',
        })],
      })],
      dependencies: [],
      moduleLevelPatterns: [],
      bodiesByUnitId: new Map(),
    };
  },
};

const nullFileAnalyzer: IFileAnalyzer = {
  analyze(_filePath: string, _content: string) {
    return null;
  },
};

describe('validate-against-patterns tool', () => {
  let fileSystem: InMemoryFileSystem;
  let patternTemplateRepo: InMemoryPatternTemplateRepository;
  let codeUnitRepo: InMemoryCodeUnitRepository;
  let handler: ReturnType<typeof createValidateAgainstPatternsTool>['handler'];
  let definition: ReturnType<typeof createValidateAgainstPatternsTool>['definition'];

  beforeEach(() => {
    fileSystem = new InMemoryFileSystem();
    patternTemplateRepo = new InMemoryPatternTemplateRepository();
    codeUnitRepo = new InMemoryCodeUnitRepository();

    const tool = createValidateAgainstPatternsTool({
      fileSystem,
      patternTemplateRepo,
      codeUnitRepo,
      fileAnalyzer: mockFileAnalyzer,
    });
    handler = tool.handler;
    definition = tool.definition;
  });

  it('should return error when file_path is not provided', async () => {
    const result = await handler({});

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('file_path');
  });

  it('should return error when file does not exist', async () => {
    const result = await handler({ file_path: 'nonexistent/file.ts' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Failed to read file');
  });

  it('should return extracted units when fileAnalyzer is provided', async () => {
    await fileSystem.writeFile('src/handler.ts', 'export function handler() {}');

    const result = await handler({ file_path: 'src/handler.ts' });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.data.extractedUnits).toHaveLength(1);
    expect(parsed.data.extractedUnits[0]).toMatchObject({
      name: 'extractedFunction',
      unitType: CodeUnitType.FUNCTION,
      lineStart: 1,
      lineEnd: 10,
      patterns: [{ patternType: PatternType.API_ENDPOINT, patternValue: 'GET /api/test' }],
    });
  });

  it('should return matched patterns when extracted patterns match templates', async () => {
    await fileSystem.writeFile('src/handler.ts', 'export function handler() {}');

    const template = createPatternTemplate({
      id: 'tmpl-1',
      name: 'API Handler Pattern',
      description: 'Standard API handler with endpoint routing',
      patternTypes: [PatternType.API_ENDPOINT],
      templateUnitId: 'unit-tmpl-1',
      templateFilePath: 'src/routes/user-route.ts',
      followerCount: 5,
      conventions: ['Use async handlers', 'Validate request body', 'Return JSON responses'],
    });
    patternTemplateRepo.save(template, []);

    const result = await handler({ file_path: 'src/handler.ts' });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.data.matchedPatterns).toHaveLength(1);
    expect(parsed.data.matchedPatterns[0]).toMatchObject({
      name: 'API Handler Pattern',
      conventions: ['Use async handlers', 'Validate request body', 'Return JSON responses'],
      templateFilePath: 'src/routes/user-route.ts',
    });
  });

  it('should return empty matchedPatterns when no templates match', async () => {
    await fileSystem.writeFile('src/handler.ts', 'export function handler() {}');

    // Add a template that does NOT match API_ENDPOINT
    const template = createPatternTemplate({
      id: 'tmpl-2',
      name: 'Database Service Pattern',
      description: 'Database access layer',
      patternTypes: [PatternType.DATABASE_READ, PatternType.DATABASE_WRITE],
      templateUnitId: 'unit-tmpl-2',
      templateFilePath: 'src/services/db-service.ts',
      followerCount: 3,
      conventions: ['Use parameterized queries'],
    });
    patternTemplateRepo.save(template, []);

    const result = await handler({ file_path: 'src/handler.ts' });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.data.matchedPatterns).toHaveLength(0);
  });

  it('should return analysis with followsConventions for matched conventions', async () => {
    await fileSystem.writeFile('src/handler.ts', 'export function handler() {}');

    const template = createPatternTemplate({
      id: 'tmpl-1',
      name: 'API Handler Pattern',
      description: 'Standard API handler',
      patternTypes: [PatternType.API_ENDPOINT],
      templateUnitId: 'unit-tmpl-1',
      templateFilePath: 'src/routes/user-route.ts',
      followerCount: 2,
      conventions: ['Use async handlers', 'Return JSON responses'],
    });
    patternTemplateRepo.save(template, []);

    const result = await handler({ file_path: 'src/handler.ts' });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.data.analysis.followsConventions).toEqual(
      expect.arrayContaining(['Use async handlers', 'Return JSON responses']),
    );
  });

  it('should return analysis with deviations for unmatched patterns', async () => {
    await fileSystem.writeFile('src/handler.ts', 'export function handler() {}');
    // No templates at all => the extracted API_ENDPOINT pattern has no template match

    const result = await handler({ file_path: 'src/handler.ts' });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.data.analysis.deviations.length).toBeGreaterThan(0);
    expect(parsed.data.analysis.deviations[0]).toContain(PatternType.API_ENDPOINT);
  });

  it('should return similar files from codeUnitRepo', async () => {
    await fileSystem.writeFile('src/handler.ts', 'export function handler() {}');

    // Add a code unit with the same pattern type in the repo
    const existingUnit = createCodeUnit({
      id: 'existing-1',
      filePath: 'src/routes/user-route.ts',
      name: 'userRoute',
      unitType: CodeUnitType.FUNCTION,
      lineStart: 1,
      lineEnd: 20,
      isAsync: true,
      isExported: true,
      language: 'typescript',
      patterns: [createCodeUnitPattern({
        codeUnitId: 'existing-1',
        patternType: PatternType.API_ENDPOINT,
        patternValue: 'GET /api/users',
      })],
    });
    codeUnitRepo.save(existingUnit);

    const result = await handler({ file_path: 'src/handler.ts' });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.data.similarFiles).toHaveLength(1);
    expect(parsed.data.similarFiles[0]).toMatchObject({
      filePath: 'src/routes/user-route.ts',
      unitName: 'userRoute',
    });
  });

  it('should work without fileAnalyzer (graceful degradation)', async () => {
    await fileSystem.writeFile('src/handler.ts', 'export function handler() {}');

    // Create tool without fileAnalyzer
    const tool = createValidateAgainstPatternsTool({
      fileSystem,
      patternTemplateRepo,
      codeUnitRepo,
    });

    const result = await tool.handler({ file_path: 'src/handler.ts' });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.data.extractedUnits).toHaveLength(0);
    expect(parsed.data.matchedPatterns).toHaveLength(0);
    expect(parsed.data.analysis).toBeDefined();
    expect(parsed.data.similarFiles).toHaveLength(0);
    // Should include a note about extraction being unavailable
    expect(result.content[0].text).toContain('unavailable');
  });

  it('should return empty extractedUnits when fileAnalyzer returns null', async () => {
    await fileSystem.writeFile('src/handler.ts', 'export function handler() {}');

    // Create tool with a fileAnalyzer that returns null
    const tool = createValidateAgainstPatternsTool({
      fileSystem,
      patternTemplateRepo,
      codeUnitRepo,
      fileAnalyzer: nullFileAnalyzer,
    });

    const result = await tool.handler({ file_path: 'src/handler.ts' });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.data.extractedUnits).toHaveLength(0);
    expect(parsed.data.matchedPatterns).toHaveLength(0);
  });
});
