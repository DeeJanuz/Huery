import { describe, it, expect, beforeEach } from 'vitest';

import { generatePatternsManifest } from '@/application/manifest/patterns-generator.js';
import {
  InMemoryCodeUnitRepository,
  InMemoryEnvVariableRepository,
  InMemoryEventFlowRepository,
  InMemoryPatternTemplateRepository,
} from '../../helpers/fakes/index.js';
import {
  createCodeUnit,
  createCodeUnitPattern,
  createEnvVariable,
  createEventFlow,
  createPatternTemplate,
  createPatternTemplateFollower,
  CodeUnitType,
  PatternType,
} from '@/domain/models/index.js';

describe('generatePatternsManifest', () => {
  let codeUnitRepo: InMemoryCodeUnitRepository;
  let envVarRepo: InMemoryEnvVariableRepository;

  beforeEach(() => {
    codeUnitRepo = new InMemoryCodeUnitRepository();
    envVarRepo = new InMemoryEnvVariableRepository();
  });

  it('should group patterns by type', () => {
    codeUnitRepo.save(
      createCodeUnit({
        id: 'unit-1',
        filePath: 'src/routes/users.ts',
        name: 'getUsers',
        unitType: CodeUnitType.FUNCTION,
        lineStart: 1,
        lineEnd: 20,
        isAsync: true,
        isExported: true,
        language: 'typescript',
        complexityScore: 5,
        patterns: [
          createCodeUnitPattern({
            codeUnitId: 'unit-1',
            patternType: PatternType.API_ENDPOINT,
            patternValue: 'GET /api/users',
          }),
        ],
      }),
    );
    codeUnitRepo.save(
      createCodeUnit({
        id: 'unit-2',
        filePath: 'src/services/user.ts',
        name: 'findUsers',
        unitType: CodeUnitType.FUNCTION,
        lineStart: 1,
        lineEnd: 15,
        isAsync: true,
        isExported: true,
        language: 'typescript',
        complexityScore: 3,
        patterns: [
          createCodeUnitPattern({
            codeUnitId: 'unit-2',
            patternType: PatternType.DATABASE_READ,
            patternValue: 'prisma.user.findMany',
          }),
        ],
      }),
    );

    const result = generatePatternsManifest({ codeUnitRepo, envVarRepo, maxTokens: 5000 });

    expect(result).toContain('# Patterns');
    expect(result).toContain('API Endpoints');
    expect(result).toContain('Database');
  });

  it('should show API endpoints with values', () => {
    codeUnitRepo.save(
      createCodeUnit({
        id: 'unit-1',
        filePath: 'src/routes/users.ts',
        name: 'getUsers',
        unitType: CodeUnitType.FUNCTION,
        lineStart: 1,
        lineEnd: 20,
        isAsync: true,
        isExported: true,
        language: 'typescript',
        complexityScore: 5,
        patterns: [
          createCodeUnitPattern({
            codeUnitId: 'unit-1',
            patternType: PatternType.API_ENDPOINT,
            patternValue: 'GET /api/users',
          }),
          createCodeUnitPattern({
            codeUnitId: 'unit-1',
            patternType: PatternType.API_ENDPOINT,
            patternValue: 'POST /api/users',
          }),
        ],
      }),
    );

    const result = generatePatternsManifest({ codeUnitRepo, envVarRepo, maxTokens: 5000 });

    expect(result).toContain('GET /api/users');
    expect(result).toContain('POST /api/users');
    expect(result).toContain('src/routes/users.ts');
    expect(result).toContain('getUsers');
  });

  it('should show database operations', () => {
    codeUnitRepo.save(
      createCodeUnit({
        id: 'unit-1',
        filePath: 'src/services/user.ts',
        name: 'createUser',
        unitType: CodeUnitType.FUNCTION,
        lineStart: 1,
        lineEnd: 30,
        isAsync: true,
        isExported: true,
        language: 'typescript',
        complexityScore: 10,
        patterns: [
          createCodeUnitPattern({
            codeUnitId: 'unit-1',
            patternType: PatternType.DATABASE_WRITE,
            patternValue: 'prisma.user.create',
          }),
        ],
      }),
    );

    const result = generatePatternsManifest({ codeUnitRepo, envVarRepo, maxTokens: 5000 });

    expect(result).toContain('Database');
    expect(result).toContain('prisma.user.create');
    expect(result).toContain('createUser');
  });

  it('should show environment variables from env var repo', () => {
    envVarRepo.save(
      createEnvVariable({
        name: 'DATABASE_URL',
        description: 'Database connection string',
        lineNumber: 1,
      }),
    );
    envVarRepo.save(
      createEnvVariable({
        name: 'STRIPE_SECRET_KEY',
        description: 'Stripe API key',
        lineNumber: 2,
      }),
    );

    const result = generatePatternsManifest({ codeUnitRepo, envVarRepo, maxTokens: 5000 });

    expect(result).toContain('Environment Variables');
    expect(result).toContain('DATABASE_URL');
    expect(result).toContain('Database connection string');
    expect(result).toContain('STRIPE_SECRET_KEY');
  });

  it('should handle no patterns', () => {
    const result = generatePatternsManifest({ codeUnitRepo, envVarRepo, maxTokens: 5000 });

    expect(result).toContain('# Patterns');
  });

  it('should respect token budget', () => {
    for (let i = 0; i < 50; i++) {
      codeUnitRepo.save(
        createCodeUnit({
          id: `unit-${i}`,
          filePath: `src/routes/route-${i}.ts`,
          name: `handler${i}`,
          unitType: CodeUnitType.FUNCTION,
          lineStart: 1,
          lineEnd: 10,
          isAsync: true,
          isExported: true,
          language: 'typescript',
          complexityScore: 5,
          patterns: [
            createCodeUnitPattern({
              codeUnitId: `unit-${i}`,
              patternType: PatternType.API_ENDPOINT,
              patternValue: `GET /api/resource-${i}`,
            }),
          ],
        }),
      );
    }

    const result = generatePatternsManifest({ codeUnitRepo, envVarRepo, maxTokens: 50 });
    expect(result.length).toBeLessThan(300);
  });

  it('should include sections with more entries first when budget is limited', () => {
    // 1 API endpoint (small section)
    codeUnitRepo.save(
      createCodeUnit({
        id: 'unit-api-1',
        filePath: 'src/routes/users.ts',
        name: 'getUsers',
        unitType: CodeUnitType.FUNCTION,
        lineStart: 1,
        lineEnd: 10,
        isAsync: true,
        isExported: true,
        language: 'typescript',
        complexityScore: 5,
        patterns: [
          createCodeUnitPattern({
            codeUnitId: 'unit-api-1',
            patternType: PatternType.API_ENDPOINT,
            patternValue: 'GET /api/users',
          }),
        ],
      }),
    );

    // 5 external services (large section, score=5)
    for (let i = 0; i < 5; i++) {
      codeUnitRepo.save(
        createCodeUnit({
          id: `unit-ext-${i}`,
          filePath: `src/services/ext-${i}.ts`,
          name: `callExt${i}`,
          unitType: CodeUnitType.FUNCTION,
          lineStart: 1,
          lineEnd: 10,
          isAsync: true,
          isExported: true,
          language: 'typescript',
          complexityScore: 3,
          patterns: [
            createCodeUnitPattern({
              codeUnitId: `unit-ext-${i}`,
              patternType: PatternType.EXTERNAL_SERVICE,
              patternValue: `service-${i}.example.com`,
            }),
          ],
        }),
      );
    }

    // Use a budget that fits the header + the larger section but not both sections
    // External Services section has 5 entries (score=5, ~74 tokens), API Endpoints has 1 (score=1, ~16 tokens)
    // Header is ~3 tokens. Budget of 85 fits header + External Services (77) but not both (93).
    // External Services should be included first due to higher score.
    const result = generatePatternsManifest({ codeUnitRepo, envVarRepo, maxTokens: 85 });

    expect(result).toContain('External Services');
    expect(result).not.toContain('API Endpoints');
  });

  it('should not include partial sections — a section is fully included or fully omitted', () => {
    // Create 10 API endpoints to make a large section
    for (let i = 0; i < 10; i++) {
      codeUnitRepo.save(
        createCodeUnit({
          id: `unit-${i}`,
          filePath: `src/routes/route-${i}.ts`,
          name: `handler${i}`,
          unitType: CodeUnitType.FUNCTION,
          lineStart: 1,
          lineEnd: 10,
          isAsync: true,
          isExported: true,
          language: 'typescript',
          complexityScore: 5,
          patterns: [
            createCodeUnitPattern({
              codeUnitId: `unit-${i}`,
              patternType: PatternType.API_ENDPOINT,
              patternValue: `GET /api/resource-${i}`,
            }),
          ],
        }),
      );
    }

    // Budget too small for all 10 entries but large enough for the header
    const result = generatePatternsManifest({ codeUnitRepo, envVarRepo, maxTokens: 20 });

    // Either the entire API Endpoints section is present or none of it is
    if (result.includes('## API Endpoints')) {
      // All 10 entries must be present
      for (let i = 0; i < 10; i++) {
        expect(result).toContain(`GET /api/resource-${i}`);
      }
    } else {
      // None of the entries should be present
      for (let i = 0; i < 10; i++) {
        expect(result).not.toContain(`GET /api/resource-${i}`);
      }
    }
  });

  it('should show omission summary when sections are cut', () => {
    // Create a large section that won't fit in a small budget
    for (let i = 0; i < 20; i++) {
      codeUnitRepo.save(
        createCodeUnit({
          id: `unit-${i}`,
          filePath: `src/routes/route-${i}.ts`,
          name: `handler${i}`,
          unitType: CodeUnitType.FUNCTION,
          lineStart: 1,
          lineEnd: 10,
          isAsync: true,
          isExported: true,
          language: 'typescript',
          complexityScore: 5,
          patterns: [
            createCodeUnitPattern({
              codeUnitId: `unit-${i}`,
              patternType: PatternType.API_ENDPOINT,
              patternValue: `GET /api/resource-${i}`,
            }),
          ],
        }),
      );
    }

    const result = generatePatternsManifest({ codeUnitRepo, envVarRepo, maxTokens: 20 });

    expect(result).toContain('more files available via MCP tools');
  });

  it('should include all sections when budget is sufficient — backward compat', () => {
    codeUnitRepo.save(
      createCodeUnit({
        id: 'unit-1',
        filePath: 'src/routes/users.ts',
        name: 'getUsers',
        unitType: CodeUnitType.FUNCTION,
        lineStart: 1,
        lineEnd: 20,
        isAsync: true,
        isExported: true,
        language: 'typescript',
        complexityScore: 5,
        patterns: [
          createCodeUnitPattern({
            codeUnitId: 'unit-1',
            patternType: PatternType.API_ENDPOINT,
            patternValue: 'GET /api/users',
          }),
        ],
      }),
    );
    codeUnitRepo.save(
      createCodeUnit({
        id: 'unit-2',
        filePath: 'src/services/user.ts',
        name: 'findUsers',
        unitType: CodeUnitType.FUNCTION,
        lineStart: 1,
        lineEnd: 15,
        isAsync: true,
        isExported: true,
        language: 'typescript',
        complexityScore: 3,
        patterns: [
          createCodeUnitPattern({
            codeUnitId: 'unit-2',
            patternType: PatternType.DATABASE_READ,
            patternValue: 'prisma.user.findMany',
          }),
        ],
      }),
    );
    envVarRepo.save(
      createEnvVariable({
        name: 'DATABASE_URL',
        description: 'Database connection string',
        lineNumber: 1,
      }),
    );

    const result = generatePatternsManifest({ codeUnitRepo, envVarRepo, maxTokens: 5000 });

    expect(result).toContain('# Patterns');
    expect(result).toContain('## API Endpoints');
    expect(result).toContain('GET /api/users');
    expect(result).toContain('## Database Operations');
    expect(result).toContain('prisma.user.findMany');
    expect(result).toContain('## Environment Variables');
    expect(result).toContain('DATABASE_URL');
    expect(result).not.toContain('more files available via MCP tools');
  });

  describe('event flows integration', () => {
    let eventFlowRepo: InMemoryEventFlowRepository;

    beforeEach(() => {
      eventFlowRepo = new InMemoryEventFlowRepository();
    });

    it('should show event flows section when eventFlowRepo is provided with data', () => {
      codeUnitRepo.save(
        createCodeUnit({
          id: 'emit-unit-1',
          filePath: 'src/services/user.ts',
          name: 'createUser',
          unitType: CodeUnitType.FUNCTION,
          lineStart: 1,
          lineEnd: 20,
          isAsync: true,
          isExported: true,
          language: 'typescript',
          complexityScore: 5,
        }),
      );
      codeUnitRepo.save(
        createCodeUnit({
          id: 'sub-unit-1',
          filePath: 'src/handlers/email.ts',
          name: 'sendWelcomeEmail',
          unitType: CodeUnitType.FUNCTION,
          lineStart: 1,
          lineEnd: 15,
          isAsync: true,
          isExported: true,
          language: 'typescript',
          complexityScore: 3,
        }),
      );

      eventFlowRepo.save(
        createEventFlow({
          codeUnitId: 'emit-unit-1',
          eventName: 'user-created',
          direction: 'emit',
          framework: 'node-events',
          lineNumber: 10,
        }),
      );
      eventFlowRepo.save(
        createEventFlow({
          codeUnitId: 'sub-unit-1',
          eventName: 'user-created',
          direction: 'subscribe',
          framework: 'node-events',
          lineNumber: 5,
        }),
      );

      const result = generatePatternsManifest({ codeUnitRepo, envVarRepo, maxTokens: 5000, eventFlowRepo });

      expect(result).toContain('## Event Flows');
      expect(result).toContain('### Emitters');
      expect(result).toContain('`user-created` (node-events) - src/services/user.ts:createUser');
      expect(result).toContain('### Subscribers');
      expect(result).toContain('`user-created` (node-events) - src/handlers/email.ts:sendWelcomeEmail');
    });

    it('should show only emitters section when there are no subscribers', () => {
      codeUnitRepo.save(
        createCodeUnit({
          id: 'emit-only-1',
          filePath: 'src/services/order.ts',
          name: 'placeOrder',
          unitType: CodeUnitType.FUNCTION,
          lineStart: 1,
          lineEnd: 30,
          isAsync: true,
          isExported: true,
          language: 'typescript',
          complexityScore: 8,
        }),
      );

      eventFlowRepo.save(
        createEventFlow({
          codeUnitId: 'emit-only-1',
          eventName: 'order-placed',
          direction: 'emit',
          framework: 'socket.io',
          lineNumber: 20,
        }),
      );

      const result = generatePatternsManifest({ codeUnitRepo, envVarRepo, maxTokens: 5000, eventFlowRepo });

      expect(result).toContain('### Emitters');
      expect(result).toContain('`order-placed` (socket.io) - src/services/order.ts:placeOrder');
      expect(result).not.toContain('### Subscribers');
    });

    it('should not show event flows section when eventFlowRepo has no data', () => {
      const result = generatePatternsManifest({ codeUnitRepo, envVarRepo, maxTokens: 5000, eventFlowRepo });

      expect(result).not.toContain('Event Flows');
    });

    it('should work without eventFlowRepo (backward compat)', () => {
      codeUnitRepo.save(
        createCodeUnit({
          id: 'bc-unit-1',
          filePath: 'src/routes/users.ts',
          name: 'getUsers',
          unitType: CodeUnitType.FUNCTION,
          lineStart: 1,
          lineEnd: 20,
          isAsync: true,
          isExported: true,
          language: 'typescript',
          complexityScore: 5,
          patterns: [
            createCodeUnitPattern({
              codeUnitId: 'bc-unit-1',
              patternType: PatternType.API_ENDPOINT,
              patternValue: 'GET /api/users',
            }),
          ],
        }),
      );

      const result = generatePatternsManifest({ codeUnitRepo, envVarRepo, maxTokens: 5000 });

      expect(result).toContain('# Patterns');
      expect(result).toContain('## API Endpoints');
      expect(result).not.toContain('Event Flows');
    });

    it('should gracefully handle event flows with unknown code unit IDs', () => {
      eventFlowRepo.save(
        createEventFlow({
          codeUnitId: 'nonexistent-unit',
          eventName: 'ghost-event',
          direction: 'emit',
          framework: 'node-events',
          lineNumber: 1,
        }),
      );

      const result = generatePatternsManifest({ codeUnitRepo, envVarRepo, maxTokens: 5000, eventFlowRepo });

      // Should not crash; the event flow with unknown unit should be skipped or handled gracefully
      expect(result).toContain('# Patterns');
    });
  });

  describe('conventions (pattern templates)', () => {
    let patternTemplateRepo: InMemoryPatternTemplateRepository;

    beforeEach(() => {
      patternTemplateRepo = new InMemoryPatternTemplateRepository();
    });

    it('should show conventions section when templates exist', () => {
      codeUnitRepo.save(
        createCodeUnit({
          id: 'tmpl-unit-1',
          filePath: 'src/api/handlers/create-user.ts',
          name: 'createUser',
          unitType: CodeUnitType.FUNCTION,
          lineStart: 10,
          lineEnd: 45,
          isAsync: true,
          isExported: true,
          language: 'typescript',
          complexityScore: 5,
        }),
      );

      patternTemplateRepo.save(
        createPatternTemplate({
          id: 'tmpl-1',
          name: 'Api Endpoint with Database Write',
          description: 'API endpoint that writes to database',
          patternTypes: [PatternType.API_ENDPOINT, PatternType.DATABASE_WRITE],
          templateUnitId: 'tmpl-unit-1',
          templateFilePath: 'src/api/handlers/create-user.ts',
          followerCount: 5,
          conventions: [
            'Validates input before database write',
            'Wraps database operations with error handling',
          ],
        }),
        [
          createPatternTemplateFollower({ templateId: 'tmpl-1', filePath: 'src/api/handlers/update-user.ts', unitName: 'updateUser' }),
        ],
      );

      const result = generatePatternsManifest({ codeUnitRepo, envVarRepo, maxTokens: 5000, patternTemplateRepo });

      expect(result).toContain('## Conventions (Recurring Pattern Combinations)');
      expect(result).toContain('Api Endpoint with Database Write');
      expect(result).toContain('5 implementations');
      expect(result).toContain('src/api/handlers/create-user.ts');
      expect(result).toContain('lines 10-45');
      expect(result).toContain('Validates input before database write');
      expect(result).toContain('Wraps database operations with error handling');
    });

    it('should sort templates by follower count descending', () => {
      codeUnitRepo.save(
        createCodeUnit({
          id: 'tmpl-unit-a',
          filePath: 'src/middleware/auth.ts',
          name: 'authMiddleware',
          unitType: CodeUnitType.FUNCTION,
          lineStart: 5,
          lineEnd: 30,
          isAsync: false,
          isExported: true,
          language: 'typescript',
          complexityScore: 3,
        }),
      );
      codeUnitRepo.save(
        createCodeUnit({
          id: 'tmpl-unit-b',
          filePath: 'src/api/handlers/create-user.ts',
          name: 'createUser',
          unitType: CodeUnitType.FUNCTION,
          lineStart: 10,
          lineEnd: 45,
          isAsync: true,
          isExported: true,
          language: 'typescript',
          complexityScore: 5,
        }),
      );

      patternTemplateRepo.save(
        createPatternTemplate({
          id: 'tmpl-small',
          name: 'Middleware with Authentication',
          description: 'Auth middleware pattern',
          patternTypes: [PatternType.EXTERNAL_SERVICE],
          templateUnitId: 'tmpl-unit-a',
          templateFilePath: 'src/middleware/auth.ts',
          followerCount: 2,
          conventions: ['Checks authentication before proceeding'],
        }),
        [],
      );
      patternTemplateRepo.save(
        createPatternTemplate({
          id: 'tmpl-large',
          name: 'Api Endpoint with Database Write',
          description: 'API endpoint that writes to DB',
          patternTypes: [PatternType.API_ENDPOINT, PatternType.DATABASE_WRITE],
          templateUnitId: 'tmpl-unit-b',
          templateFilePath: 'src/api/handlers/create-user.ts',
          followerCount: 7,
          conventions: ['Validates input before database write'],
        }),
        [],
      );

      const result = generatePatternsManifest({ codeUnitRepo, envVarRepo, maxTokens: 5000, patternTemplateRepo });

      const largeIdx = result.indexOf('Api Endpoint with Database Write');
      const smallIdx = result.indexOf('Middleware with Authentication');
      expect(largeIdx).toBeGreaterThan(-1);
      expect(smallIdx).toBeGreaterThan(-1);
      expect(largeIdx).toBeLessThan(smallIdx);
    });

    it('should show template name, implementation count, file path, and line range', () => {
      codeUnitRepo.save(
        createCodeUnit({
          id: 'tmpl-unit-detail',
          filePath: 'src/services/order.ts',
          name: 'placeOrder',
          unitType: CodeUnitType.FUNCTION,
          lineStart: 20,
          lineEnd: 80,
          isAsync: true,
          isExported: true,
          language: 'typescript',
          complexityScore: 12,
        }),
      );

      patternTemplateRepo.save(
        createPatternTemplate({
          id: 'tmpl-detail',
          name: 'Order Processing Pipeline',
          description: 'Standard order processing',
          patternTypes: [PatternType.DATABASE_WRITE],
          templateUnitId: 'tmpl-unit-detail',
          templateFilePath: 'src/services/order.ts',
          followerCount: 3,
          conventions: ['Validates stock before commit'],
        }),
        [],
      );

      const result = generatePatternsManifest({ codeUnitRepo, envVarRepo, maxTokens: 5000, patternTemplateRepo });

      expect(result).toContain('### Order Processing Pipeline (3 implementations)');
      expect(result).toContain('Template: src/services/order.ts (lines 20-80)');
    });

    it('should list conventions as bullet points', () => {
      codeUnitRepo.save(
        createCodeUnit({
          id: 'tmpl-unit-conv',
          filePath: 'src/api/create.ts',
          name: 'create',
          unitType: CodeUnitType.FUNCTION,
          lineStart: 1,
          lineEnd: 50,
          isAsync: true,
          isExported: true,
          language: 'typescript',
          complexityScore: 5,
        }),
      );

      patternTemplateRepo.save(
        createPatternTemplate({
          id: 'tmpl-conv',
          name: 'CRUD Endpoint',
          description: 'Standard CRUD pattern',
          patternTypes: [PatternType.API_ENDPOINT],
          templateUnitId: 'tmpl-unit-conv',
          templateFilePath: 'src/api/create.ts',
          followerCount: 4,
          conventions: [
            'Validates input schema',
            'Returns 201 on success',
            'Logs operation for audit',
          ],
        }),
        [],
      );

      const result = generatePatternsManifest({ codeUnitRepo, envVarRepo, maxTokens: 5000, patternTemplateRepo });

      expect(result).toContain('- Validates input schema');
      expect(result).toContain('- Returns 201 on success');
      expect(result).toContain('- Logs operation for audit');
    });

    it('should not show conventions section when patternTemplateRepo is not provided', () => {
      const result = generatePatternsManifest({ codeUnitRepo, envVarRepo, maxTokens: 5000 });

      expect(result).not.toContain('Conventions');
    });

    it('should not show conventions section when no templates exist', () => {
      const result = generatePatternsManifest({ codeUnitRepo, envVarRepo, maxTokens: 5000, patternTemplateRepo });

      expect(result).not.toContain('Conventions');
    });

    it('should respect token budget for conventions section', () => {
      // Create many templates to make the conventions section large
      for (let i = 0; i < 20; i++) {
        codeUnitRepo.save(
          createCodeUnit({
            id: `tmpl-unit-budget-${i}`,
            filePath: `src/handlers/handler-${i}.ts`,
            name: `handler${i}`,
            unitType: CodeUnitType.FUNCTION,
            lineStart: 1,
            lineEnd: 50,
            isAsync: true,
            isExported: true,
            language: 'typescript',
            complexityScore: 5,
          }),
        );

        patternTemplateRepo.save(
          createPatternTemplate({
            id: `tmpl-budget-${i}`,
            name: `Pattern Template Number ${i} With a Long Name`,
            description: `Description for template ${i}`,
            patternTypes: [PatternType.API_ENDPOINT],
            templateUnitId: `tmpl-unit-budget-${i}`,
            templateFilePath: `src/handlers/handler-${i}.ts`,
            followerCount: 20 - i,
            conventions: [
              `Convention A for template ${i}`,
              `Convention B for template ${i}`,
              `Convention C for template ${i}`,
            ],
          }),
          [],
        );
      }

      // Use a tiny budget that won't fit the conventions section
      const result = generatePatternsManifest({ codeUnitRepo, envVarRepo, maxTokens: 15, patternTemplateRepo });

      // The header takes some budget; conventions should not blow past the limit
      expect(result).toContain('# Patterns');
      // The total output should be bounded
      expect(result.length).toBeLessThan(200);
    });

    it('should use templateFilePath when template unit is not in codeUnitRepo', () => {
      // Don't save the code unit - only the template exists
      patternTemplateRepo.save(
        createPatternTemplate({
          id: 'tmpl-orphan',
          name: 'Orphan Template',
          description: 'Template with missing code unit',
          patternTypes: [PatternType.API_ENDPOINT],
          templateUnitId: 'nonexistent-unit',
          templateFilePath: 'src/orphan/handler.ts',
          followerCount: 3,
          conventions: ['Some convention'],
        }),
        [],
      );

      const result = generatePatternsManifest({ codeUnitRepo, envVarRepo, maxTokens: 5000, patternTemplateRepo });

      expect(result).toContain('### Orphan Template (3 implementations)');
      expect(result).toContain('Template: src/orphan/handler.ts');
      // Should not crash, just won't have line range
      expect(result).not.toContain('lines');
    });
  });
});
