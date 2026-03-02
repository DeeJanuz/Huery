/**
 * SchemaParser interface for the strategy pattern.
 *
 * Each parser implementation detects and extracts schema models
 * for a specific ORM/schema framework.
 */

import type { ExtractedSchemaModel } from '../schema-model-extractor.js';

/**
 * Strategy interface for parsing schema models from file content.
 */
export interface SchemaParser {
  /**
   * Determine whether this parser can handle the given file content and path.
   */
  canParse(content: string, filePath: string): boolean;

  /**
   * Parse schema models from the file content.
   * Should only be called when canParse returns true.
   */
  parse(content: string, filePath: string): ExtractedSchemaModel[];
}
