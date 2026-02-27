import type Database from 'better-sqlite3';
import type { CodeUnit, CodeUnitType, CodeUnitPattern } from '@/domain/models/index.js';
import type { ICodeUnitRepository } from '@/domain/ports/index.js';

interface CodeUnitRow {
  id: string;
  file_path: string;
  name: string;
  unit_type: string;
  line_start: number;
  line_end: number;
  parent_unit_id: string | null;
  signature: string | null;
  is_async: number;
  is_exported: number;
  language: string;
  complexity: string;
  complexity_score: number;
}

interface PatternRow {
  id: string;
  code_unit_id: string;
  pattern_type: string;
  pattern_value: string;
  line_number: number | null;
  column_access: string | null;
}

export class SqliteCodeUnitRepository implements ICodeUnitRepository {
  private readonly insertUnit: Database.Statement;
  private readonly insertPattern: Database.Statement;
  private readonly deletePatternsByUnitId: Database.Statement;
  private readonly selectById: Database.Statement;
  private readonly selectPatternsByUnitId: Database.Statement;
  private readonly selectByFilePath: Database.Statement;
  private readonly selectByType: Database.Statement;
  private readonly selectByLanguage: Database.Statement;
  private readonly selectAll: Database.Statement;
  private readonly deleteByFilePathStmt: Database.Statement;
  private readonly clearUnitsStmt: Database.Statement;
  private readonly clearPatternsStmt: Database.Statement;
  private readonly selectChildrenByParentId: Database.Statement;

  constructor(private readonly db: Database.Database) {
    this.insertUnit = db.prepare(`
      INSERT OR REPLACE INTO code_units
        (id, file_path, name, unit_type, line_start, line_end, parent_unit_id, signature, is_async, is_exported, language, complexity, complexity_score)
      VALUES
        (@id, @file_path, @name, @unit_type, @line_start, @line_end, @parent_unit_id, @signature, @is_async, @is_exported, @language, @complexity, @complexity_score)
    `);

    this.insertPattern = db.prepare(`
      INSERT OR REPLACE INTO code_unit_patterns
        (id, code_unit_id, pattern_type, pattern_value, line_number, column_access)
      VALUES
        (@id, @code_unit_id, @pattern_type, @pattern_value, @line_number, @column_access)
    `);

    this.deletePatternsByUnitId = db.prepare(
      'DELETE FROM code_unit_patterns WHERE code_unit_id = ?',
    );

    this.selectById = db.prepare('SELECT * FROM code_units WHERE id = ?');
    this.selectPatternsByUnitId = db.prepare(
      'SELECT * FROM code_unit_patterns WHERE code_unit_id = ?',
    );
    this.selectChildrenByParentId = db.prepare(
      'SELECT * FROM code_units WHERE parent_unit_id = ?',
    );
    this.selectByFilePath = db.prepare(
      'SELECT * FROM code_units WHERE file_path = ? AND parent_unit_id IS NULL',
    );
    this.selectByType = db.prepare(
      'SELECT * FROM code_units WHERE unit_type = ? AND parent_unit_id IS NULL',
    );
    this.selectByLanguage = db.prepare(
      'SELECT * FROM code_units WHERE language = ? AND parent_unit_id IS NULL',
    );
    this.selectAll = db.prepare('SELECT * FROM code_units WHERE parent_unit_id IS NULL');
    this.deleteByFilePathStmt = db.prepare('DELETE FROM code_units WHERE file_path = ?');
    this.clearUnitsStmt = db.prepare('DELETE FROM code_units');
    this.clearPatternsStmt = db.prepare('DELETE FROM code_unit_patterns');
  }

  save(unit: CodeUnit): void {
    const saveTransaction = this.db.transaction(() => {
      this.saveUnit(unit);
    });

    saveTransaction();
  }

  saveBatch(units: CodeUnit[]): void {
    const batchTransaction = this.db.transaction(() => {
      for (const unit of units) {
        this.save(unit);
      }
    });

    batchTransaction();
  }

  findById(id: string): CodeUnit | undefined {
    const row = this.selectById.get(id) as CodeUnitRow | undefined;
    if (!row) return undefined;
    return this.rowToCodeUnit(row);
  }

  findByFilePath(filePath: string): CodeUnit[] {
    const rows = this.selectByFilePath.all(filePath) as CodeUnitRow[];
    return rows.map((row) => this.rowToCodeUnit(row));
  }

  findByType(unitType: CodeUnitType): CodeUnit[] {
    const rows = this.selectByType.all(unitType) as CodeUnitRow[];
    return rows.map((row) => this.rowToCodeUnit(row));
  }

  findByLanguage(language: string): CodeUnit[] {
    const rows = this.selectByLanguage.all(language) as CodeUnitRow[];
    return rows.map((row) => this.rowToCodeUnit(row));
  }

  findAll(): CodeUnit[] {
    const rows = this.selectAll.all() as CodeUnitRow[];
    return rows.map((row) => this.rowToCodeUnit(row));
  }

  deleteByFilePath(filePath: string): void {
    this.deleteByFilePathStmt.run(filePath);
  }

  clear(): void {
    const clearTransaction = this.db.transaction(() => {
      this.clearPatternsStmt.run();
      this.clearUnitsStmt.run();
    });
    clearTransaction();
  }

  private saveUnit(unit: CodeUnit): void {
    this.deletePatternsByUnitId.run(unit.id);

    this.insertUnit.run({
      id: unit.id,
      file_path: unit.filePath,
      name: unit.name,
      unit_type: unit.unitType,
      line_start: unit.lineStart,
      line_end: unit.lineEnd,
      parent_unit_id: unit.parentUnitId ?? null,
      signature: unit.signature ?? null,
      is_async: unit.isAsync ? 1 : 0,
      is_exported: unit.isExported ? 1 : 0,
      language: unit.language,
      complexity: JSON.stringify(unit.complexity),
      complexity_score: unit.complexityScore,
    });

    for (const pattern of unit.patterns) {
      this.insertPattern.run({
        id: pattern.id,
        code_unit_id: pattern.codeUnitId,
        pattern_type: pattern.patternType,
        pattern_value: pattern.patternValue,
        line_number: pattern.lineNumber ?? null,
        column_access: pattern.columnAccess ? JSON.stringify(pattern.columnAccess) : null,
      });
    }

    for (const child of unit.children) {
      this.saveUnit({
        ...child,
        parentUnitId: unit.id,
      });
    }
  }

  private rowToCodeUnit(row: CodeUnitRow, maxDepth = 3): CodeUnit {
    const patternRows = this.selectPatternsByUnitId.all(row.id) as PatternRow[];
    const patterns: CodeUnitPattern[] = patternRows.map((p) => ({
      id: p.id,
      codeUnitId: p.code_unit_id,
      patternType: p.pattern_type as CodeUnitPattern['patternType'],
      patternValue: p.pattern_value,
      lineNumber: p.line_number ?? undefined,
      columnAccess: p.column_access ? JSON.parse(p.column_access) : undefined,
    }));

    const children: CodeUnit[] =
      maxDepth > 0
        ? (this.selectChildrenByParentId.all(row.id) as CodeUnitRow[]).map((childRow) =>
            this.rowToCodeUnit(childRow, maxDepth - 1),
          )
        : [];

    return {
      id: row.id,
      filePath: row.file_path,
      name: row.name,
      unitType: row.unit_type as CodeUnit['unitType'],
      lineStart: row.line_start,
      lineEnd: row.line_end,
      parentUnitId: row.parent_unit_id ?? undefined,
      signature: row.signature ?? undefined,
      isAsync: row.is_async === 1,
      isExported: row.is_exported === 1,
      language: row.language,
      complexity: JSON.parse(row.complexity) as Record<string, number>,
      complexityScore: row.complexity_score,
      patterns,
      children,
    };
  }
}
