import { describe, it, expect, vi } from 'vitest';
import { createMcpServer } from '@/adapters/mcp/server.js';

const mockDeps = {
  codeUnitRepo: {
    findAll: vi.fn().mockReturnValue([]),
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
    expect(instructions).toContain('READ');
    expect(instructions).toContain('VERIFY');

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
});
