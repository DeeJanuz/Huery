/**
 * Prisma schema parser.
 *
 * Detects Prisma models by .prisma file extension and extracts
 * model definitions with their fields, relations, and table mappings.
 */

import type { ExtractedSchemaModel, ExtractedSchemaModelField } from '../schema-model-extractor.js';
import { getLineNumber, isLineCommented, extractBracedBlock } from '../extraction-utils.js';
import type { SchemaParser } from './schema-parser.js';

const PRISMA_MODEL_PATTERN = /^model\s+(\w+)\s*\{/gm;

export class PrismaSchemaParser implements SchemaParser {
  canParse(_content: string, filePath: string): boolean {
    return filePath.endsWith('.prisma');
  }

  parse(content: string, _filePath: string): ExtractedSchemaModel[] {
    const models: ExtractedSchemaModel[] = [];
    const pattern = new RegExp(PRISMA_MODEL_PATTERN.source, 'gm');
    let match;

    while ((match = pattern.exec(content)) !== null) {
      if (isLineCommented(content, match.index)) continue;

      const modelName = match[1];
      const lineNumber = getLineNumber(content, match.index);
      const blockContent = extractBracedBlock(content, match.index + match[0].length - 1);
      if (blockContent === null) continue;

      const fields = parsePrismaFields(blockContent);
      const tableName = extractPrismaTableName(blockContent);

      models.push({
        name: modelName,
        framework: 'prisma',
        tableName,
        fields,
        lineNumber,
      });
    }

    return models;
  }
}

function parsePrismaFields(blockContent: string): ExtractedSchemaModelField[] {
  const fields: ExtractedSchemaModelField[] = [];
  const lines = blockContent.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    // Skip empty lines, comments, and directives (@@...)
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('@@')) continue;

    // A field line starts with a lowercase or underscore identifier, then a type
    const fieldMatch = trimmed.match(/^(\w+)\s+(\w+\??\[?\]?)\s*(.*)?$/);
    if (!fieldMatch) continue;

    const name = fieldMatch[1];
    const rawType = fieldMatch[2];
    const attributes = fieldMatch[3] || '';

    // Skip if name looks like a directive
    if (name.startsWith('@@')) continue;

    const isOptional = rawType.endsWith('?');
    const fieldType = isOptional ? rawType.slice(0, -1) : rawType;

    const isPrimaryKey = attributes.includes('@id');
    const isUnique = attributes.includes('@unique');
    const hasDefault = attributes.includes('@default');

    // Detect relation target: the field type itself if @relation is present
    let relationTarget: string | undefined;
    if (attributes.includes('@relation')) {
      relationTarget = fieldType.replace('[]', '');
    }

    fields.push({
      name,
      fieldType: isOptional ? fieldType : rawType,
      isPrimaryKey,
      isRequired: !isOptional,
      isUnique,
      hasDefault,
      relationTarget,
    });
  }

  return fields;
}

function extractPrismaTableName(blockContent: string): string | undefined {
  const mapMatch = blockContent.match(/@@map\s*\(\s*"([^"]+)"\s*\)/);
  return mapMatch ? mapMatch[1] : undefined;
}
