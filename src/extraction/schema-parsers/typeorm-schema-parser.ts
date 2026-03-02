/**
 * TypeORM schema parser.
 *
 * Detects TypeORM entities by @Entity() decorator in content and extracts
 * entity definitions with their fields, relations, and table names.
 */

import type { ExtractedSchemaModel, ExtractedSchemaModelField } from '../schema-model-extractor.js';
import { getLineNumber, extractBracedBlock } from '../extraction-utils.js';
import type { SchemaParser } from './schema-parser.js';

const TYPEORM_ENTITY_PATTERN = /@Entity\s*\(\s*(?:'([^']*)'|"([^"]*)")?\s*\)\s*\n\s*class\s+(\w+)/g;

export class TypeOrmSchemaParser implements SchemaParser {
  canParse(content: string, _filePath: string): boolean {
    return /@Entity\s*\(/.test(content);
  }

  parse(content: string, _filePath: string): ExtractedSchemaModel[] {
    const models: ExtractedSchemaModel[] = [];
    const pattern = new RegExp(TYPEORM_ENTITY_PATTERN.source, 'g');
    let match;

    while ((match = pattern.exec(content)) !== null) {
      const tableName = match[1] || match[2] || undefined;
      const className = match[3];
      const lineNumber = getLineNumber(content, match.index);

      // Find the class body opening brace
      const classStart = content.indexOf('{', match.index + match[0].length - className.length);
      if (classStart === -1) continue;

      const blockContent = extractBracedBlock(content, classStart);
      if (blockContent === null) continue;

      const fields = parseTypeOrmFields(blockContent);

      models.push({
        name: className,
        framework: 'typeorm',
        tableName,
        fields,
        lineNumber,
      });
    }

    return models;
  }
}

function parseTypeOrmFields(blockContent: string): ExtractedSchemaModelField[] {
  const fields: ExtractedSchemaModelField[] = [];
  const lines = blockContent.split('\n');

  let currentDecorators: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Collect decorator lines
    if (trimmed.startsWith('@')) {
      currentDecorators.push(trimmed);
      continue;
    }

    // If we have decorators and this looks like a field declaration
    if (currentDecorators.length > 0) {
      const fieldMatch = trimmed.match(/^(\w+)\s*(?:[:!?])\s*(\w+[\[\]]*)\s*;?/);
      if (fieldMatch) {
        const field = buildTypeOrmField(fieldMatch[1], fieldMatch[2], currentDecorators);
        fields.push(field);
      }
      currentDecorators = [];
      continue;
    }

    currentDecorators = [];
  }

  return fields;
}

function buildTypeOrmField(
  name: string,
  fieldType: string,
  decorators: string[],
): ExtractedSchemaModelField {
  let isPrimaryKey = false;
  let isRequired = true;
  let isUnique = false;
  let hasDefault = false;
  let relationTarget: string | undefined;

  for (const dec of decorators) {
    if (dec.includes('@PrimaryGeneratedColumn')) {
      isPrimaryKey = true;
      hasDefault = true;
    }
    if (dec.includes('@PrimaryColumn')) {
      isPrimaryKey = true;
    }
    if (dec.includes('unique: true') || dec.includes('unique:true')) {
      isUnique = true;
    }
    if (dec.includes('nullable: true') || dec.includes('nullable:true')) {
      isRequired = false;
    }
    if (/default\s*:/.test(dec)) {
      hasDefault = true;
    }

    // Relation decorators
    const relationMatch = dec.match(/@(?:ManyToOne|OneToMany|OneToOne|ManyToMany)\s*\(\s*\(\)\s*=>\s*(\w+)/);
    if (relationMatch) {
      relationTarget = relationMatch[1];
    }
  }

  return {
    name,
    fieldType,
    isPrimaryKey,
    isRequired,
    isUnique,
    hasDefault,
    relationTarget,
  };
}
