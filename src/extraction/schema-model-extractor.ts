/**
 * Schema Model Extractor
 *
 * Extracts schema/model definitions from ORM and schema definition files.
 * Works heuristically with regex-based pattern matching for speed.
 *
 * Supported frameworks:
 * - Prisma (detected by .prisma file extension)
 * - TypeORM (detected by @Entity() decorator in content)
 * - Mongoose (detected by new Schema({ or new mongoose.Schema( in content)
 * - Drizzle (detected by pgTable(, mysqlTable(, sqliteTable( in content)
 */

import { getLineNumber } from './extraction-utils.js';

/**
 * Represents a single field within a schema model.
 */
export interface ExtractedSchemaModelField {
  readonly name: string;
  readonly fieldType: string;
  readonly isPrimaryKey: boolean;
  readonly isRequired: boolean;
  readonly isUnique: boolean;
  readonly hasDefault: boolean;
  readonly relationTarget?: string;
}

/**
 * Represents a schema model extracted from a file.
 */
export interface ExtractedSchemaModel {
  readonly name: string;
  readonly framework: string;
  readonly tableName?: string;
  readonly fields: ExtractedSchemaModelField[];
  readonly lineNumber: number;
}

/**
 * Extract schema models from file content.
 * Detects the framework heuristically based on file extension and content patterns.
 *
 * @param content - The file content to analyze
 * @param filePath - The file path (used for extension-based detection)
 * @returns Array of ExtractedSchemaModel objects
 */
export function extractSchemaModels(content: string, filePath: string): ExtractedSchemaModel[] {
  if (!content.trim()) {
    return [];
  }

  const models: ExtractedSchemaModel[] = [];

  if (isPrismaFile(filePath)) {
    extractPrismaModels(content, models);
  }

  if (hasTypeOrmEntities(content)) {
    extractTypeOrmEntities(content, models);
  }

  if (hasMongooseSchemas(content)) {
    extractMongooseSchemas(content, models);
  }

  if (hasDrizzleTables(content)) {
    extractDrizzleTables(content, models);
  }

  return models;
}

// ---------------------------------------------------------------------------
// Framework detection helpers
// ---------------------------------------------------------------------------

function isPrismaFile(filePath: string): boolean {
  return filePath.endsWith('.prisma');
}

function hasTypeOrmEntities(content: string): boolean {
  return /@Entity\s*\(/.test(content);
}

function hasMongooseSchemas(content: string): boolean {
  return /new\s+(?:mongoose\.)?Schema\s*\(/.test(content);
}

function hasDrizzleTables(content: string): boolean {
  return /(?:pgTable|mysqlTable|sqliteTable)\s*\(/.test(content);
}

/**
 * Check whether the character at `index` is inside a line comment (// ...).
 * Only handles single-line comments for Prisma files.
 */
function isLineCommented(content: string, index: number): boolean {
  const lineStart = content.lastIndexOf('\n', index - 1) + 1;
  const linePrefix = content.slice(lineStart, index);
  return /\/\//.test(linePrefix);
}

// ---------------------------------------------------------------------------
// Prisma extraction
// ---------------------------------------------------------------------------

const PRISMA_MODEL_PATTERN = /^model\s+(\w+)\s*\{/gm;

function extractPrismaModels(content: string, models: ExtractedSchemaModel[]): void {
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

// ---------------------------------------------------------------------------
// TypeORM extraction
// ---------------------------------------------------------------------------

const TYPEORM_ENTITY_PATTERN = /@Entity\s*\(\s*(?:'([^']*)'|"([^"]*)")?\s*\)\s*\n\s*class\s+(\w+)/g;

function extractTypeOrmEntities(content: string, models: ExtractedSchemaModel[]): void {
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

// ---------------------------------------------------------------------------
// Mongoose extraction
// ---------------------------------------------------------------------------

const MONGOOSE_SCHEMA_PATTERN = /(?:const|let|var)\s+(\w+)\s*=\s*new\s+(?:mongoose\.)?Schema\s*\(\s*\{/g;

function extractMongooseSchemas(content: string, models: ExtractedSchemaModel[]): void {
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

// ---------------------------------------------------------------------------
// Drizzle extraction
// ---------------------------------------------------------------------------

const DRIZZLE_TABLE_PATTERN =
  /(?:export\s+)?(?:const|let)\s+(\w+)\s*=\s*(?:pgTable|mysqlTable|sqliteTable)\s*\(\s*['"](\w+)['"]\s*,\s*\{/g;

function extractDrizzleTables(content: string, models: ExtractedSchemaModel[]): void {
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

// ---------------------------------------------------------------------------
// Shared utility: extract content between matched braces
// ---------------------------------------------------------------------------

/**
 * Extract the content between the opening brace at the given index and its matching closing brace.
 * Returns the content between the braces (exclusive), or null if no matching brace is found.
 */
function extractBracedBlock(content: string, openBraceIndex: number): string | null {
  if (content[openBraceIndex] !== '{') return null;

  let depth = 0;
  for (let i = openBraceIndex; i < content.length; i++) {
    if (content[i] === '{') {
      depth++;
    } else if (content[i] === '}') {
      depth--;
      if (depth === 0) {
        return content.slice(openBraceIndex + 1, i);
      }
    }
  }
  return null;
}
