import { describe, it, expect } from 'vitest';
import {
  generateTestFileCandidates,
  getExtension,
} from '@/adapters/mcp/test-file-discovery.js';

describe('test-file-discovery', () => {
  describe('getExtension', () => {
    it('should extract ts extension', () => {
      expect(getExtension('src/foo/bar.ts')).toBe('ts');
    });

    it('should extract js extension', () => {
      expect(getExtension('src/foo/bar.js')).toBe('js');
    });

    it('should extract py extension', () => {
      expect(getExtension('lib/utils.py')).toBe('py');
    });

    it('should default to ts when no extension', () => {
      expect(getExtension('Makefile')).toBe('ts');
    });
  });

  describe('generateTestFileCandidates', () => {
    it('should return TestFileCandidate[] with testFilePath and testedFilePath', () => {
      const candidates = generateTestFileCandidates('src/services/order.ts');

      expect(candidates.length).toBeGreaterThan(0);
      for (const c of candidates) {
        expect(c).toHaveProperty('testFilePath');
        expect(c).toHaveProperty('testedFilePath');
        expect(c.testedFilePath).toBe('src/services/order.ts');
      }
    });

    describe('src/ paths', () => {
      it('should generate tests/ mirror with .test extension', () => {
        const candidates = generateTestFileCandidates('src/services/order.ts');
        const paths = candidates.map((c) => c.testFilePath);

        expect(paths).toContain('tests/services/order.test.ts');
      });

      it('should generate tests/ mirror with .spec extension', () => {
        const candidates = generateTestFileCandidates('src/services/order.ts');
        const paths = candidates.map((c) => c.testFilePath);

        expect(paths).toContain('tests/services/order.spec.ts');
      });

      it('should generate co-located __tests__ candidate', () => {
        const candidates = generateTestFileCandidates('src/services/order.ts');
        const paths = candidates.map((c) => c.testFilePath);

        expect(paths).toContain('src/services/__tests__/order.test.ts');
      });

      it('should generate co-located .test candidate', () => {
        const candidates = generateTestFileCandidates('src/services/order.ts');
        const paths = candidates.map((c) => c.testFilePath);

        expect(paths).toContain('src/services/order.test.ts');
      });

      it('should handle nested src paths', () => {
        const candidates = generateTestFileCandidates('src/adapters/mcp/tools/search.ts');
        const paths = candidates.map((c) => c.testFilePath);

        expect(paths).toContain('tests/adapters/mcp/tools/search.test.ts');
        expect(paths).toContain('tests/adapters/mcp/tools/search.spec.ts');
      });

      it('should handle js extension', () => {
        const candidates = generateTestFileCandidates('src/utils/helper.js');
        const paths = candidates.map((c) => c.testFilePath);

        expect(paths).toContain('tests/utils/helper.test.js');
        expect(paths).toContain('tests/utils/helper.spec.js');
      });
    });

    describe('non-src/ paths', () => {
      it('should generate co-located .test candidate', () => {
        const candidates = generateTestFileCandidates('lib/utils/helper.ts');
        const paths = candidates.map((c) => c.testFilePath);

        expect(paths).toContain('lib/utils/helper.test.ts');
      });

      it('should generate co-located .spec candidate', () => {
        const candidates = generateTestFileCandidates('lib/utils/helper.ts');
        const paths = candidates.map((c) => c.testFilePath);

        expect(paths).toContain('lib/utils/helper.spec.ts');
      });

      it('should not generate tests/ mirror for non-src paths', () => {
        const candidates = generateTestFileCandidates('lib/utils/helper.ts');
        const paths = candidates.map((c) => c.testFilePath);

        const testsMirror = paths.filter((p) => p.startsWith('tests/'));
        expect(testsMirror).toHaveLength(0);
      });
    });
  });
});
