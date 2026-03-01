import { describe, it, expect, vi } from 'vitest';
import { createMcpServer } from '@/adapters/mcp/server.js';

const mockDeps = {
  codeUnitRepo: {
    findAll: vi.fn().mockReturnValue([]),
    findById: vi.fn().mockReturnValue(undefined),
    count: vi.fn().mockReturnValue(0),
  } as any,
  dependencyRepo: {
    findAll: vi.fn().mockReturnValue([]),
    count: vi.fn().mockReturnValue(0),
  } as any,
  envVarRepo: {
    findAll: vi.fn().mockReturnValue([]),
    count: vi.fn().mockReturnValue(0),
  } as any,
  fileSystem: {
    readFile: vi.fn(),
    exists: vi.fn(),
  } as any,
};

const mockDeepAnalysisDeps = {
  ...mockDeps,
  functionCallRepo: {
    findAll: vi.fn().mockReturnValue([]),
    findByCallerUnitId: vi.fn().mockReturnValue([]),
    findByCalleeName: vi.fn().mockReturnValue([]),
    findByCalleeUnitId: vi.fn().mockReturnValue([]),
  } as any,
  typeFieldRepo: {
    findAll: vi.fn().mockReturnValue([]),
    findByParentUnitId: vi.fn().mockReturnValue([]),
  } as any,
  eventFlowRepo: {
    findAll: vi.fn().mockReturnValue([]),
    findByCodeUnitId: vi.fn().mockReturnValue([]),
    findByEventName: vi.fn().mockReturnValue([]),
  } as any,
  schemaModelRepo: {
    findAll: vi.fn().mockReturnValue([]),
    findById: vi.fn().mockReturnValue(undefined),
    findByName: vi.fn().mockReturnValue(undefined),
    findByFilePath: vi.fn().mockReturnValue([]),
    findByFramework: vi.fn().mockReturnValue([]),
  } as any,
};

describe('createMcpServer', () => {
  it('should create a server with instructions', () => {
    const server = createMcpServer(mockDeps);
    expect(server).toBeDefined();
    // Access private _instructions field to verify it was set
    const instructions = (server as any)._instructions;
    expect(instructions).toBeDefined();
    expect(typeof instructions).toBe('string');
    expect(instructions.length).toBeGreaterThan(0);
  });

  it('should include hybrid workflow guidance in instructions', () => {
    const server = createMcpServer(mockDeps);
    const instructions = (server as any)._instructions as string;

    // Verify key workflow steps are mentioned
    expect(instructions).toContain('ORIENT');
    expect(instructions).toContain('TARGET');
    expect(instructions).toContain('DEEP READ');

    // Verify key tools are mentioned
    expect(instructions).toContain('get_analysis_stats');
    expect(instructions).toContain('search_codebase');
    expect(instructions).toContain('get_code_units');
    expect(instructions).toContain('get_dependencies');
    expect(instructions).toContain('vector_search');

    // Verify manifest file references
    expect(instructions).toContain('MODULES.md');
    expect(instructions).toContain('PATTERNS.md');
    expect(instructions).toContain('DEPENDENCIES.md');
    expect(instructions).toContain('HOTSPOTS.md');
  });

  it('should include deep analysis tools in instructions', () => {
    const server = createMcpServer(mockDeps);
    const instructions = (server as any)._instructions as string;

    expect(instructions).toContain('trace_call_chain');
    expect(instructions).toContain('get_event_flow');
    expect(instructions).toContain('get_data_models');
    expect(instructions).toContain('get_function_context');
  });

  it('should register deep analysis tools when deps are provided', () => {
    const server = createMcpServer(mockDeepAnalysisDeps);
    expect(server).toBeDefined();
    // The server should be created without errors when all deep analysis deps are provided
  });

  it('should not error when deep analysis deps are omitted', () => {
    const server = createMcpServer(mockDeps);
    expect(server).toBeDefined();
    // Server should work fine without optional deps
  });

  it('should include get_env_variables in instructions', () => {
    const server = createMcpServer(mockDeps);
    const instructions = (server as any)._instructions as string;

    expect(instructions).toContain('get_env_variables');
    expect(instructions).toContain('.env.example');
  });

  it('should reference ~10K tokens in ORIENT step', () => {
    const server = createMcpServer(mockDeps);
    const instructions = (server as any)._instructions as string;

    expect(instructions).toContain('~10K tokens');
  });
});
