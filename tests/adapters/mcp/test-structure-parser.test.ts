import { describe, it, expect } from 'vitest';
import {
  extractTestStructure,
  summarizeSetupBody,
  determineConventions,
} from '@/adapters/mcp/test-structure-parser.js';
import type { TestFileResult } from '@/adapters/mcp/test-structure-parser.js';

describe('test-structure-parser', () => {
  describe('extractTestStructure', () => {
    it('should count it() blocks', () => {
      const testFiles: TestFileResult[] = [
        {
          testFilePath: 'tests/foo.test.ts',
          testedFilePath: 'src/foo.ts',
          source: `
            it('should do A', () => {});
            it('should do B', () => {});
            it('should do C', () => {});
          `,
        },
      ];

      const result = extractTestStructure(testFiles);

      expect(result.testCount).toBe(3);
    });

    it('should extract import lines', () => {
      const testFiles: TestFileResult[] = [
        {
          testFilePath: 'tests/foo.test.ts',
          testedFilePath: 'src/foo.ts',
          source: `import { describe, it } from 'vitest';
import { foo } from '../src/foo.js';

describe('foo', () => {
  it('works', () => {});
});`,
        },
      ];

      const result = extractTestStructure(testFiles);

      expect(result.imports).toHaveLength(2);
      expect(result.imports[0]).toContain('vitest');
      expect(result.imports[1]).toContain('foo');
    });

    it('should deduplicate imports across files', () => {
      const testFiles: TestFileResult[] = [
        {
          testFilePath: 'tests/foo.test.ts',
          testedFilePath: 'src/foo.ts',
          source: `import { describe, it } from 'vitest';\nit('a', () => {});`,
        },
        {
          testFilePath: 'tests/bar.test.ts',
          testedFilePath: 'src/bar.ts',
          source: `import { describe, it } from 'vitest';\nit('b', () => {});`,
        },
      ];

      const result = extractTestStructure(testFiles);

      expect(result.imports).toHaveLength(1);
    });

    it('should detect beforeEach setup pattern', () => {
      const testFiles: TestFileResult[] = [
        {
          testFilePath: 'tests/foo.test.ts',
          testedFilePath: 'src/foo.ts',
          source: `
beforeEach(() => {
  repo = new InMemoryRepo();
});
it('works', () => {});`,
        },
      ];

      const result = extractTestStructure(testFiles);

      expect(result.setupPattern).not.toBeNull();
      expect(result.setupPattern).toContain('beforeEach');
    });

    it('should detect beforeAll setup pattern', () => {
      const testFiles: TestFileResult[] = [
        {
          testFilePath: 'tests/foo.test.ts',
          testedFilePath: 'src/foo.ts',
          source: `
beforeAll(() => {
  // setup
});
it('works', () => {});`,
        },
      ];

      const result = extractTestStructure(testFiles);

      expect(result.setupPattern).toBe('beforeAll');
    });

    it('should return null setupPattern when no setup present', () => {
      const testFiles: TestFileResult[] = [
        {
          testFilePath: 'tests/foo.test.ts',
          testedFilePath: 'src/foo.ts',
          source: `it('works', () => {});`,
        },
      ];

      const result = extractTestStructure(testFiles);

      expect(result.setupPattern).toBeNull();
    });

    it('should sum test counts across multiple files', () => {
      const testFiles: TestFileResult[] = [
        {
          testFilePath: 'tests/foo.test.ts',
          testedFilePath: 'src/foo.ts',
          source: `it('a', () => {}); it('b', () => {});`,
        },
        {
          testFilePath: 'tests/bar.test.ts',
          testedFilePath: 'src/bar.ts',
          source: `it('c', () => {});`,
        },
      ];

      const result = extractTestStructure(testFiles);

      expect(result.testCount).toBe(3);
    });
  });

  describe('summarizeSetupBody', () => {
    it('should detect fake repos in setup', () => {
      const body = 'repo = new InMemoryRepo();\nfs = new FakeFileSystem();';
      const result = summarizeSetupBody(body);

      expect(result).toBe('fake repos');
    });

    it('should list class names when no repo/fake pattern', () => {
      const body = 'service = new PaymentService();\nclient = new HttpClient();';
      const result = summarizeSetupBody(body);

      expect(result).toBe('PaymentService, HttpClient');
    });

    it('should return initialization when no assignments found', () => {
      const body = 'doSomething();\nconfigure();';
      const result = summarizeSetupBody(body);

      expect(result).toBe('initialization');
    });
  });

  describe('determineConventions', () => {
    it('should detect tests/ mirror location', () => {
      const testFiles: TestFileResult[] = [
        {
          testFilePath: 'tests/services/order.test.ts',
          testedFilePath: 'src/services/order.ts',
          source: '',
        },
      ];

      const result = determineConventions(testFiles);

      expect(result.testFileLocation).toBe('tests/ mirror');
    });

    it('should detect co-located __tests__ location', () => {
      const testFiles: TestFileResult[] = [
        {
          testFilePath: 'src/services/__tests__/order.test.ts',
          testedFilePath: 'src/services/order.ts',
          source: '',
        },
      ];

      const result = determineConventions(testFiles);

      expect(result.testFileLocation).toBe('co-located __tests__');
    });

    it('should detect co-located location', () => {
      const testFiles: TestFileResult[] = [
        {
          testFilePath: 'src/services/order.test.ts',
          testedFilePath: 'src/services/order.ts',
          source: '',
        },
      ];

      const result = determineConventions(testFiles);

      expect(result.testFileLocation).toBe('co-located');
    });

    it('should detect .test.ts naming pattern', () => {
      const testFiles: TestFileResult[] = [
        {
          testFilePath: 'tests/foo.test.ts',
          testedFilePath: 'src/foo.ts',
          source: '',
        },
      ];

      const result = determineConventions(testFiles);

      expect(result.namingPattern).toBe('.test.ts');
    });

    it('should detect .spec.ts naming pattern', () => {
      const testFiles: TestFileResult[] = [
        {
          testFilePath: 'tests/foo.spec.ts',
          testedFilePath: 'src/foo.ts',
          source: '',
        },
      ];

      const result = determineConventions(testFiles);

      expect(result.namingPattern).toBe('.spec.ts');
    });

    it('should return defaults when no test files', () => {
      const result = determineConventions([]);

      expect(result.testFileLocation).toBe('unknown');
      expect(result.namingPattern).toBe('.test.ts');
    });

    it('should pick most common convention when mixed', () => {
      const testFiles: TestFileResult[] = [
        {
          testFilePath: 'tests/a.test.ts',
          testedFilePath: 'src/a.ts',
          source: '',
        },
        {
          testFilePath: 'tests/b.test.ts',
          testedFilePath: 'src/b.ts',
          source: '',
        },
        {
          testFilePath: 'src/c/__tests__/c.test.ts',
          testedFilePath: 'src/c/c.ts',
          source: '',
        },
      ];

      const result = determineConventions(testFiles);

      expect(result.testFileLocation).toBe('tests/ mirror');
    });
  });
});
