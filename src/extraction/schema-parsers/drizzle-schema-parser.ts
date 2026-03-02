/**
 * Drizzle schema parser.
 *
 * Detects Drizzle table definitions by pgTable(, mysqlTable(, sqliteTable( patterns
 * and extracts table definitions with their columns and references.
 */

import type { ExtractedSchemaModel, ExtractedSchemaModelField } from '../schema-model-extractor.js';
import { getLineNumber, extractBracedBlock } from '../extraction-utils.js';
import type { SchemaParser } from './schema-parser.js';

const DRIZZLE_TABLE_PATTERN =
  /(?:export\s+)?(?:const|let)\s+(\w+)\s*=\s*(?:pgTable|mysqlTable|sqliteTable)\s*\(\s*['"](\w+)['"]\s*,\s*\{/g;

export class DrizzleSchemaParser implements SchemaParser {
  canParse(content: string, _filePath: string): boolean {
    return /(?:pgTable|mysqlTable|sqliteTable)\s*\(/.test(content);
  }

  parse(content: string, _filePath: string): ExtractedSchemaModel[] {
    const models: ExtractedSchemaModel[] = [];
    const pattern = new RegExp(DRIZZLE_TABLE_PATTERN.source, 'g');
    let match;

    while ((match = pattern.exec(content)) !== null) {
      const varName = match[1];
      const tableName = match[2];
      const lineNumber = getLineNumber(content, match.index);

      // Find the opening brace of the columns object
      const braceIndex = content.lastIndexOf('{', match.index + match[0].length);
      const blockContent = extractBracedBlock(content, braceIndex);
      if (blockContent === null) continue;

      const fields = parseDrizzleFields(blockContent);

      models.push({
        name: varName,
        framework: 'drizzle',
        tableName,
        fields,
        lineNumber,
      });
    }

    return models;
  }
}

function parseDrizzleFields(blockContent: string): ExtractedSchemaModelField[] {
  const fields: ExtractedSchemaModelField[] = [];

  // Match each field definition line:
  // fieldName: typeFunction('column_name')...
  const fieldPattern = /(\w+)\s*:\s*(\w+)\s*\([^)]*\)([\s\S]*?)(?=,\s*\n|\n\s*\})/g;
  let match;

  while ((match = fieldPattern.exec(blockContent)) !== null) {
    const name = match[1];
    const typeFunc = match[2];
    const chainedCalls = match[0];

    const isPrimaryKey = /\.primaryKey\s*\(/.test(chainedCalls);
    const isUnique = /\.unique\s*\(/.test(chainedCalls);
    const isRequired = /\.notNull\s*\(/.test(chainedCalls);
    const hasDefault = /\.default\s*\(/.test(chainedCalls);

    // Detect references
    let relationTarget: string | undefined;
    const refMatch = chainedCalls.match(/\.references\s*\(\s*\(\)\s*=>\s*(\w+)\./);
    if (refMatch) {
      relationTarget = refMatch[1];
    }

    fields.push({
      name,
      fieldType: typeFunc,
      isPrimaryKey,
      isRequired,
      isUnique,
      hasDefault,
      relationTarget,
    });
  }

  return fields;
}
