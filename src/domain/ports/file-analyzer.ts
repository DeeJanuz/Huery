import type { FileProcessingResult } from '@/application/file-processor.js';

/**
 * Port for analyzing a file and extracting code units, patterns, and dependencies.
 * Used by MCP tools that need real-time file analysis (e.g., validate-against-patterns).
 */
export interface IFileAnalyzer {
  analyze(filePath: string, content: string): FileProcessingResult | null;
}
