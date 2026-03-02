/**
 * Mongoose schema parser.
 *
 * Detects Mongoose schemas by new Schema({ or new mongoose.Schema( patterns
 * and extracts schema definitions with their fields and relations.
 */

import type { ExtractedSchemaModel, ExtractedSchemaModelField } from '../schema-model-extractor.js';
import { getLineNumber, extractBracedBlock } from '../extraction-utils.js';
import type { SchemaParser } from './schema-parser.js';

const MONGOOSE_SCHEMA_PATTERN = /(?:const|let|var)\s+(\w+)\s*=\s*new\s+(?:mongoose\.)?Schema\s*\(\s*\{/g;

export class MongooseSchemaParser implements SchemaParser {
  canParse(content: string, _filePath: string): boolean {
    return /new\s+(?:mongoose\.)?Schema\s*\(/.test(content);
  }

  parse(content: string, _filePath: string): ExtractedSchemaModel[] {
    const models: ExtractedSchemaModel[] = [];
    const pattern = new RegExp(MONGOOSE_SCHEMA_PATTERN.source, 'g');
    let match;

    while ((match = pattern.exec(content)) !== null) {
      const varName = match[1];
      const lineNumber = getLineNumber(content, match.index);

      // Model name: strip "Schema" suffix
      const modelName = varName.endsWith('Schema')
        ? varName.slice(0, -'Schema'.length)
        : varName;

      // Find the opening brace of the schema object
      const braceIndex = content.lastIndexOf('{', match.index + match[0].length);
      const blockContent = extractBracedBlock(content, braceIndex);
      if (blockContent === null) continue;

      const fields = parseMongooseFields(blockContent);

      models.push({
        name: modelName,
        framework: 'mongoose',
        fields,
        lineNumber,
      });
    }

    return models;
  }
}

function parseMongooseFields(blockContent: string): ExtractedSchemaModelField[] {
  const fields: ExtractedSchemaModelField[] = [];

  // Match top-level fields within the schema object.
  // We need to handle two patterns:
  // 1. Simple: fieldName: Type
  // 2. Object: fieldName: { type: Type, ... }
  const fieldPattern = /(\w+)\s*:\s*(\{[^}]*\}|[A-Z]\w*)/g;
  let match;

  while ((match = fieldPattern.exec(blockContent)) !== null) {
    const name = match[1];
    const value = match[2];

    // Skip if name looks like a meta-option (e.g., 'type', 'required', etc.)
    // These would be nested inside a field object, not top-level
    if (['type', 'required', 'unique', 'default', 'ref', 'enum', 'index'].includes(name)) {
      continue;
    }

    if (value.startsWith('{')) {
      // Object form: { type: String, required: true, ... }
      const field = parseMongooseObjectField(name, value);
      fields.push(field);
    } else {
      // Simple form: fieldName: String
      fields.push({
        name,
        fieldType: value,
        isPrimaryKey: name === '_id',
        isRequired: false,
        isUnique: false,
        hasDefault: false,
      });
    }
  }

  return fields;
}

function parseMongooseObjectField(name: string, value: string): ExtractedSchemaModelField {
  // Extract type
  const typeMatch = value.match(/type\s*:\s*([\w.]+)/);
  const fieldType = typeMatch ? typeMatch[1].replace('Schema.Types.', '') : 'Mixed';

  const isRequired = /required\s*:\s*true/.test(value);
  const isUnique = /unique\s*:\s*true/.test(value);
  const hasDefault = /default\s*:/.test(value);

  // Detect ref for relations
  const refMatch = value.match(/ref\s*:\s*['"](\w+)['"]/);
  const relationTarget = refMatch ? refMatch[1] : undefined;

  return {
    name,
    fieldType: fieldType === 'ObjectId' ? 'ObjectId' : fieldType,
    isPrimaryKey: name === '_id',
    isRequired,
    isUnique,
    hasDefault,
    relationTarget,
  };
}
