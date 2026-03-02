/**
 * Schema Model Extractor
 *
 * Orchestrates schema/model extraction by delegating to framework-specific
 * SchemaParser implementations. Each parser handles detection and extraction
 * for its respective ORM/schema framework.
 *
 * Supported frameworks:
 * - Prisma (detected by .prisma file extension)
 * - TypeORM (detected by @Entity() decorator in content)
 * - Mongoose (detected by new Schema({ or new mongoose.Schema( in content)
 * - Drizzle (detected by pgTable(, mysqlTable(, sqliteTable( in content)
 */

import type { SchemaParser } from './schema-parsers/schema-parser.js';
import { PrismaSchemaParser } from './schema-parsers/prisma-schema-parser.js';
import { TypeOrmSchemaParser } from './schema-parsers/typeorm-schema-parser.js';
import { MongooseSchemaParser } from './schema-parsers/mongoose-schema-parser.js';
import { DrizzleSchemaParser } from './schema-parsers/drizzle-schema-parser.js';

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
 * Registered schema parsers, checked in order.
 */
const parsers: readonly SchemaParser[] = [
  new PrismaSchemaParser(),
  new TypeOrmSchemaParser(),
  new MongooseSchemaParser(),
  new DrizzleSchemaParser(),
];

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

  for (const parser of parsers) {
    if (parser.canParse(content, filePath)) {
      models.push(...parser.parse(content, filePath));
    }
  }

  return models;
}
