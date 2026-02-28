import { describe, it, expect, beforeEach } from 'vitest';

import { generateManifests } from '@/application/manifest/manifest-generator.js';
import type { ManifestDependencies, ManifestOptions } from '@/application/manifest/manifest-generator.js';
import {
  InMemoryCodeUnitRepository,
  InMemoryFileDependencyRepository,
  InMemoryEnvVariableRepository,
  InMemoryFileSystem,
  InMemorySchemaModelRepository,
  InMemoryTypeFieldRepository,
  InMemoryEventFlowRepository,
  InMemoryFunctionCallRepository,
} from '../../helpers/fakes/index.js';
import {
  createCodeUnit,
  createCodeUnitPattern,
  createFileDependency,
  createEnvVariable,
  createSchemaModel,
  createSchemaModelField,
  createTypeField,
  createEventFlow,
  createFunctionCall,
  CodeUnitType,
  PatternType,
  ImportType,
} from '@/domain/models/index.js';

describe('generateManifests', () => {
  let deps: ManifestDependencies;
  let fileSystem: InMemoryFileSystem;

  beforeEach(() => {
    fileSystem = new InMemoryFileSystem();
    deps = {
      codeUnitRepo: new InMemoryCodeUnitRepository(),
      dependencyRepo: new InMemoryFileDependencyRepository(),
      envVarRepo: new InMemoryEnvVariableRepository(),
      fileSystem,
    };
  });

  it('should generate all 4 manifest files', async () => {
    const options: ManifestOptions = { outputDir: '.heury' };

    await generateManifests(deps, options);

    expect(await fileSystem.exists('.heury/MODULES.md')).toBe(true);
    expect(await fileSystem.exists('.heury/PATTERNS.md')).toBe(true);
    expect(await fileSystem.exists('.heury/DEPENDENCIES.md')).toBe(true);
    expect(await fileSystem.exists('.heury/HOTSPOTS.md')).toBe(true);
  });

  it('should write correct content to output directory', async () => {
    const codeUnitRepo = deps.codeUnitRepo as InMemoryCodeUnitRepository;
    codeUnitRepo.save(
      createCodeUnit({
        filePath: 'src/index.ts',
        name: 'main',
        unitType: CodeUnitType.FUNCTION,
        lineStart: 1,
        lineEnd: 10,
        isAsync: false,
        isExported: true,
        language: 'typescript',
        complexityScore: 5,
      }),
    );

    await generateManifests(deps, { outputDir: '.heury' });

    const modulesContent = await fileSystem.readFile('.heury/MODULES.md');
    expect(modulesContent).toContain('# Modules');
    expect(modulesContent).toContain('main');
  });

  it('should apply a finite default token budget of 10000', async () => {
    // Add enough data that would exceed 10000 tokens to verify truncation occurs
    const codeUnitRepo = deps.codeUnitRepo as InMemoryCodeUnitRepository;
    for (let i = 0; i < 200; i++) {
      codeUnitRepo.save(
        createCodeUnit({
          filePath: `src/modules/module-${i}.ts`,
          name: `longFunctionNameToConsumeTokenBudget_${i}_${'x'.repeat(50)}`,
          unitType: CodeUnitType.FUNCTION,
          lineStart: 1,
          lineEnd: 10,
          isAsync: true,
          isExported: true,
          language: 'typescript',
          complexityScore: i,
        }),
      );
    }

    await generateManifests(deps, { outputDir: '.heury' });

    // All files should exist and have content
    const modules = await fileSystem.readFile('.heury/MODULES.md');
    const hotspots = await fileSystem.readFile('.heury/HOTSPOTS.md');

    expect(modules.length).toBeGreaterThan(0);
    expect(hotspots.length).toBeGreaterThan(0);

    // With 10000 budget (2500 per section), large data should be truncated
    // At least one manifest should show omission evidence
    const allContent = modules + hotspots;
    // The total char length should be bounded (10000 tokens * ~4 chars/token = ~40000 chars)
    expect(modules.length + hotspots.length).toBeLessThan(50000);
  });

  it('should allow totalTokenBudget option to override the default', async () => {
    const codeUnitRepo = deps.codeUnitRepo as InMemoryCodeUnitRepository;
    for (let i = 0; i < 100; i++) {
      codeUnitRepo.save(
        createCodeUnit({
          filePath: `src/modules/module-${i}.ts`,
          name: `function${i}`,
          unitType: CodeUnitType.FUNCTION,
          lineStart: 1,
          lineEnd: 10,
          isAsync: true,
          isExported: true,
          language: 'typescript',
          complexityScore: i,
        }),
      );
    }

    // Provide a very large budget to ensure no truncation
    await generateManifests(deps, { outputDir: '.heury', totalTokenBudget: Infinity });

    const modules = await fileSystem.readFile('.heury/MODULES.md');
    const hotspots = await fileSystem.readFile('.heury/HOTSPOTS.md');

    // With Infinity budget, no sections should be omitted
    expect(modules).not.toContain('more files available via MCP tools');
    expect(hotspots).not.toContain('more files available via MCP tools');
  });

  it('should use custom budget when provided', async () => {
    const codeUnitRepo = deps.codeUnitRepo as InMemoryCodeUnitRepository;
    for (let i = 0; i < 100; i++) {
      codeUnitRepo.save(
        createCodeUnit({
          filePath: `src/modules/module-${i}.ts`,
          name: `function${i}`,
          unitType: CodeUnitType.FUNCTION,
          lineStart: 1,
          lineEnd: 10,
          isAsync: true,
          isExported: true,
          language: 'typescript',
          complexityScore: i,
        }),
      );
    }

    await generateManifests(deps, { outputDir: '.heury', totalTokenBudget: 200 });

    const modules = await fileSystem.readFile('.heury/MODULES.md');
    const hotspots = await fileSystem.readFile('.heury/HOTSPOTS.md');
    // With only 200 tokens total, files should be quite short
    expect(modules.length).toBeLessThan(500);
    expect(hotspots.length).toBeLessThan(500);
  });

  it('should create output directory if needed', async () => {
    await generateManifests(deps, { outputDir: 'output/manifests' });

    expect(await fileSystem.exists('output/manifests/MODULES.md')).toBe(true);
  });

  it('should generate SCHEMA.md when schemaModelRepo is provided', async () => {
    const schemaModelRepo = new InMemorySchemaModelRepository();
    const modelId = 'test-model';
    schemaModelRepo.save(
      createSchemaModel({
        id: modelId,
        name: 'User',
        filePath: 'prisma/schema.prisma',
        framework: 'prisma',
        tableName: 'users',
        fields: [
          createSchemaModelField({
            modelId,
            name: 'id',
            fieldType: 'Int',
            isPrimaryKey: true,
            isRequired: true,
            hasDefault: true,
          }),
          createSchemaModelField({
            modelId,
            name: 'email',
            fieldType: 'String',
            isRequired: true,
            isUnique: true,
          }),
        ],
      }),
    );

    const depsWithSchema: ManifestDependencies = {
      ...deps,
      schemaModelRepo,
    };

    await generateManifests(depsWithSchema, { outputDir: '.heury' });

    expect(await fileSystem.exists('.heury/SCHEMA.md')).toBe(true);
    const schemaContent = await fileSystem.readFile('.heury/SCHEMA.md');
    expect(schemaContent).toContain('# Schema');
    expect(schemaContent).toContain('User');
  });

  it('should not generate SCHEMA.md when schemaModelRepo is not provided', async () => {
    await generateManifests(deps, { outputDir: '.heury' });

    expect(await fileSystem.exists('.heury/SCHEMA.md')).toBe(false);
  });

  it('should pass deep repos through to sub-generators', async () => {
    const typeFieldRepo = new InMemoryTypeFieldRepository();
    const eventFlowRepo = new InMemoryEventFlowRepository();
    const functionCallRepo = new InMemoryFunctionCallRepository();

    const codeUnitRepo = deps.codeUnitRepo as InMemoryCodeUnitRepository;
    const unitId = 'deep-unit-1';
    codeUnitRepo.save(
      createCodeUnit({
        id: unitId,
        filePath: 'src/models/item.ts',
        name: 'Item',
        unitType: CodeUnitType.INTERFACE,
        lineStart: 1,
        lineEnd: 10,
        isAsync: false,
        isExported: true,
        language: 'typescript',
        complexityScore: 0,
      }),
    );

    // Add a type field that should appear in MODULES.md
    typeFieldRepo.save(
      createTypeField({
        parentUnitId: unitId,
        name: 'price',
        fieldType: 'number',
        isOptional: false,
        isReadonly: false,
        lineNumber: 2,
      }),
    );

    const depsWithDeep: ManifestDependencies = {
      ...deps,
      typeFieldRepo,
      eventFlowRepo,
      functionCallRepo,
    };

    await generateManifests(depsWithDeep, { outputDir: '.heury' });

    const modulesContent = await fileSystem.readFile('.heury/MODULES.md');
    expect(modulesContent).toContain('price: number');
  });
});
