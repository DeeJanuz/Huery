/**
 * File Filter
 *
 * Determines whether a file should be processed during analysis.
 * Checks file extension against registered languages, skip directories,
 * test file patterns, and user-provided include/exclude globs.
 */

import type { LanguageRegistry } from '@/extraction/language-registry.js';

export interface FileFilterOptions {
  readonly include: string[];
  readonly exclude: string[];
  readonly skipTests: boolean;
}

const DEFAULT_OPTIONS: FileFilterOptions = {
  include: [],
  exclude: [],
  skipTests: false,
};

/**
 * Convert a simple glob pattern to a RegExp.
 * Supports ** (any path) and * (any segment).
 */
export function globToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '{{GLOBSTAR}}')
    .replace(/\*/g, '[^/]*')
    .replace(/\{\{GLOBSTAR\}\}/g, '.*');
  return new RegExp(`^${escaped}$`);
}

/**
 * Check whether a file path passes the include/exclude glob filters.
 * If include is non-empty, the path must match at least one include pattern.
 * If exclude is non-empty, the path must not match any exclude pattern.
 */
export function passesGlobFilters(
  filePath: string,
  config: { readonly include: string[]; readonly exclude: string[] },
): boolean {
  if (config.exclude.length > 0) {
    for (const pattern of config.exclude) {
      if (globToRegex(pattern).test(filePath)) return false;
    }
  }
  if (config.include.length > 0) {
    return config.include.some(pattern => globToRegex(pattern).test(filePath));
  }
  return true;
}

/**
 * Determine if a file should be processed during analysis.
 *
 * @param filePath - The file path to check
 * @param registry - Language registry for extension and test detection
 * @param options - Optional filtering options
 * @returns true if the file should be processed
 */
export function shouldProcessFile(
  filePath: string,
  registry: LanguageRegistry,
  options?: Partial<FileFilterOptions>,
): boolean {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Must have a recognized extension
  const extractor = registry.getExtractorForFile(filePath);
  if (!extractor) return false;

  // Skip .d.ts declaration files
  if (filePath.endsWith('.d.ts')) return false;

  // Skip files in skip directories
  const skipDirs = registry.getAllSkipDirectories();
  const parts = filePath.split('/');
  for (const part of parts) {
    if (skipDirs.includes(part)) return false;
    // Skip dot directories (except .github)
    if (part.startsWith('.') && part !== '.github' && part !== parts[parts.length - 1]) {
      return false;
    }
  }

  // Skip test files if requested
  if (opts.skipTests && registry.isTestFile(filePath)) {
    return false;
  }

  // Check exclude patterns
  if (opts.exclude.length > 0) {
    for (const pattern of opts.exclude) {
      if (globToRegex(pattern).test(filePath)) {
        return false;
      }
    }
  }

  // Check include patterns (if specified, file must match at least one)
  if (opts.include.length > 0) {
    const matched = opts.include.some(pattern => globToRegex(pattern).test(filePath));
    if (!matched) return false;
  }

  return true;
}
