/**
 * Shared module: test structure parsing.
 * Extracts test structure (imports, setup patterns, test counts) and
 * determines conventions (file location, naming) from test file sources.
 */

export interface TestFileResult {
  readonly testFilePath: string;
  readonly testedFilePath: string;
  readonly source: string;
}

export interface TestStructure {
  readonly imports: string[];
  readonly setupPattern: string | null;
  readonly testCount: number;
}

export function extractTestStructure(testFiles: TestFileResult[]): TestStructure {
  const allImports: string[] = [];
  let totalTestCount = 0;
  let setupPattern: string | null = null;

  for (const testFile of testFiles) {
    const { source } = testFile;

    // Extract imports
    const importLines = source.split('\n').filter((line) =>
      /^\s*import\s/.test(line),
    );
    allImports.push(...importLines);

    // Count it() blocks
    const itMatches = source.match(/\bit\s*\(/g);
    if (itMatches) {
      totalTestCount += itMatches.length;
    }

    // Extract setup pattern
    if (!setupPattern) {
      if (/beforeEach\s*\(/.test(source)) {
        const beforeEachMatch = source.match(/beforeEach\s*\(\s*(?:async\s*)?\(\)\s*=>\s*\{([^}]*)\}/s);
        if (beforeEachMatch) {
          const body = beforeEachMatch[1].trim();
          setupPattern = `beforeEach with ${summarizeSetupBody(body)}`;
        } else {
          setupPattern = 'beforeEach';
        }
      } else if (/beforeAll\s*\(/.test(source)) {
        setupPattern = 'beforeAll';
      }
    }
  }

  // Deduplicate imports
  const uniqueImports = [...new Set(allImports)];

  return {
    imports: uniqueImports,
    setupPattern,
    testCount: totalTestCount,
  };
}

export function summarizeSetupBody(body: string): string {
  const assignments = body.match(/(\w+)\s*=\s*new\s+(\w+)/g);
  if (assignments && assignments.length > 0) {
    const repos = assignments.map((a) => {
      const match = a.match(/new\s+(\w+)/);
      return match ? match[1] : '';
    }).filter(Boolean);

    if (repos.some((r) => /repo/i.test(r) || /fake/i.test(r))) {
      return 'fake repos';
    }
    return repos.join(', ');
  }
  return 'initialization';
}

export function determineConventions(testFiles: TestFileResult[]): {
  testFileLocation: string;
  namingPattern: string;
} {
  let testFileLocation = 'unknown';
  let namingPattern = '.test.ts';

  if (testFiles.length === 0) {
    return { testFileLocation, namingPattern };
  }

  const locations = new Map<string, number>();
  const namingPatterns = new Map<string, number>();

  for (const testFile of testFiles) {
    const path = testFile.testFilePath;

    // Check location
    if (path.startsWith('tests/')) {
      locations.set('tests/ mirror', (locations.get('tests/ mirror') ?? 0) + 1);
    } else if (path.includes('__tests__/')) {
      locations.set('co-located __tests__', (locations.get('co-located __tests__') ?? 0) + 1);
    } else {
      locations.set('co-located', (locations.get('co-located') ?? 0) + 1);
    }

    // Check naming
    if (path.endsWith('.test.ts') || path.endsWith('.test.js')) {
      const ext = path.endsWith('.test.ts') ? '.test.ts' : '.test.js';
      namingPatterns.set(ext, (namingPatterns.get(ext) ?? 0) + 1);
    } else if (path.endsWith('.spec.ts') || path.endsWith('.spec.js')) {
      const ext = path.endsWith('.spec.ts') ? '.spec.ts' : '.spec.js';
      namingPatterns.set(ext, (namingPatterns.get(ext) ?? 0) + 1);
    }
  }

  if (locations.size > 0) {
    testFileLocation = [...locations.entries()].sort((a, b) => b[1] - a[1])[0][0];
  }

  if (namingPatterns.size > 0) {
    namingPattern = [...namingPatterns.entries()].sort((a, b) => b[1] - a[1])[0][0];
  }

  return { testFileLocation, namingPattern };
}
