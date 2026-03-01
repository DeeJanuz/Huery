/**
 * Shared module: test file candidate discovery.
 * Given a source file path, generates candidate test file paths
 * following common conventions (tests/ mirror, __tests__, co-located).
 */

export interface TestFileCandidate {
  readonly testFilePath: string;
  readonly testedFilePath: string;
}

export function getExtension(filePath: string): string {
  const match = filePath.match(/\.(\w+)$/);
  return match ? match[1] : 'ts';
}

export function generateTestFileCandidates(filePath: string): TestFileCandidate[] {
  const candidates: TestFileCandidate[] = [];

  const ext = getExtension(filePath);
  const withoutExt = filePath.replace(new RegExp(`\\.${ext}$`), '');

  if (filePath.startsWith('src/')) {
    const relativePath = filePath.slice(4); // Remove "src/"
    const relativeWithoutExt = relativePath.replace(new RegExp(`\\.${ext}$`), '');

    // tests/ mirror: tests/foo/bar.test.ts and tests/foo/bar.spec.ts
    candidates.push({
      testFilePath: `tests/${relativeWithoutExt}.test.${ext}`,
      testedFilePath: filePath,
    });
    candidates.push({
      testFilePath: `tests/${relativeWithoutExt}.spec.${ext}`,
      testedFilePath: filePath,
    });

    // Co-located __tests__: src/foo/__tests__/bar.test.ts
    const dirParts = filePath.split('/');
    const fileName = dirParts.pop()!;
    const dir = dirParts.join('/');
    const fileNameWithoutExt = fileName.replace(new RegExp(`\\.${ext}$`), '');
    candidates.push({
      testFilePath: `${dir}/__tests__/${fileNameWithoutExt}.test.${ext}`,
      testedFilePath: filePath,
    });

    // Co-located: src/foo/bar.test.ts
    candidates.push({
      testFilePath: `${withoutExt}.test.${ext}`,
      testedFilePath: filePath,
    });
  } else {
    // Non-src paths: just check co-located patterns
    candidates.push({
      testFilePath: `${withoutExt}.test.${ext}`,
      testedFilePath: filePath,
    });
    candidates.push({
      testFilePath: `${withoutExt}.spec.${ext}`,
      testedFilePath: filePath,
    });
  }

  return candidates;
}
