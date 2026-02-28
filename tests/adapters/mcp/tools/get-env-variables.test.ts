import { describe, it, expect, beforeEach } from 'vitest';
import { createGetEnvVariablesTool } from '@/adapters/mcp/tools/get-env-variables.js';
import { InMemoryEnvVariableRepository } from '../../../../tests/helpers/fakes/index.js';
import { createEnvVariable } from '@/domain/models/index.js';

describe('get-env-variables tool', () => {
  let envVarRepo: InMemoryEnvVariableRepository;
  let handler: ReturnType<typeof createGetEnvVariablesTool>['handler'];
  let definition: ReturnType<typeof createGetEnvVariablesTool>['definition'];

  beforeEach(() => {
    envVarRepo = new InMemoryEnvVariableRepository();
    const tool = createGetEnvVariablesTool({ envVarRepo });
    handler = tool.handler;
    definition = tool.definition;

    envVarRepo.save(createEnvVariable({
      id: 'env-1',
      name: 'DATABASE_URL',
      description: 'PostgreSQL connection string',
      hasDefault: false,
      lineNumber: 1,
    }));
    envVarRepo.save(createEnvVariable({
      id: 'env-2',
      name: 'PORT',
      description: 'Server port',
      hasDefault: true,
      lineNumber: 2,
    }));
    envVarRepo.save(createEnvVariable({
      id: 'env-3',
      name: 'NODE_ENV',
      hasDefault: true,
      lineNumber: 3,
    }));
  });

  it('should have correct tool definition', () => {
    expect(definition.name).toBe('get-env-variables');
    expect(definition.description).toContain('environment variables');
    expect(definition.inputSchema).toEqual({ type: 'object', properties: {} });
  });

  it('should return all env variables from repo', async () => {
    const result = await handler({});
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.data).toHaveLength(3);
  });

  it('should map to correct output format with name, description, hasDefault', async () => {
    const result = await handler({});
    const parsed = JSON.parse(result.content[0].text);

    const dbUrl = parsed.data.find((v: { name: string }) => v.name === 'DATABASE_URL');
    expect(dbUrl).toEqual({
      name: 'DATABASE_URL',
      description: 'PostgreSQL connection string',
      hasDefault: false,
    });

    const port = parsed.data.find((v: { name: string }) => v.name === 'PORT');
    expect(port).toEqual({
      name: 'PORT',
      description: 'Server port',
      hasDefault: true,
    });
  });

  it('should exclude internal fields id and lineNumber', async () => {
    const result = await handler({});
    const parsed = JSON.parse(result.content[0].text);

    for (const item of parsed.data) {
      expect(item).not.toHaveProperty('id');
      expect(item).not.toHaveProperty('lineNumber');
    }
  });

  it('should omit description when undefined', async () => {
    const result = await handler({});
    const parsed = JSON.parse(result.content[0].text);

    const nodeEnv = parsed.data.find((v: { name: string }) => v.name === 'NODE_ENV');
    expect(nodeEnv).toEqual({
      name: 'NODE_ENV',
      hasDefault: true,
    });
    expect(nodeEnv).not.toHaveProperty('description');
  });

  it('should handle empty repo', async () => {
    envVarRepo.clear();
    const result = await handler({});
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.data).toHaveLength(0);
    expect(parsed.meta.result_count).toBe(0);
  });
});
