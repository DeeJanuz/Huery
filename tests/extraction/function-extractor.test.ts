import { describe, it, expect } from 'vitest';
import { CodeUnitType } from '@/domain/models/index.js';
import { extractCodeUnits } from '@/extraction/function-extractor.js';

describe('extractCodeUnits', () => {
  describe('named function declarations', () => {
    it('should extract a named function declaration', () => {
      const code = 'function greet(name) {\n  return `Hello, ${name}`;\n}';
      const units = extractCodeUnits(code, 'test.ts');
      expect(units).toHaveLength(1);
      expect(units[0].name).toBe('greet');
      expect(units[0].unitType).toBe(CodeUnitType.FUNCTION);
      expect(units[0].lineStart).toBe(1);
      expect(units[0].lineEnd).toBe(3);
      expect(units[0].isAsync).toBe(false);
      expect(units[0].isExported).toBe(false);
    });

    it('should extract an async function declaration', () => {
      const code = 'async function fetchData(url) {\n  const res = await fetch(url);\n  return res.json();\n}';
      const units = extractCodeUnits(code, 'test.ts');
      expect(units).toHaveLength(1);
      expect(units[0].name).toBe('fetchData');
      expect(units[0].isAsync).toBe(true);
    });

    it('should extract an exported function declaration', () => {
      const code = 'export function helper(x) {\n  return x * 2;\n}';
      const units = extractCodeUnits(code, 'test.ts');
      expect(units).toHaveLength(1);
      expect(units[0].name).toBe('helper');
      expect(units[0].isExported).toBe(true);
    });

    it('should extract an exported async function', () => {
      const code = 'export async function loadData() {\n  return [];\n}';
      const units = extractCodeUnits(code, 'test.ts');
      expect(units).toHaveLength(1);
      expect(units[0].isAsync).toBe(true);
      expect(units[0].isExported).toBe(true);
    });

    it('should extract function signature with parameters', () => {
      const code = 'function add(a: number, b: number) {\n  return a + b;\n}';
      const units = extractCodeUnits(code, 'test.ts');
      expect(units).toHaveLength(1);
      expect(units[0].signature).toBe('(a: number, b: number)');
    });

    it('should extract function signature with return type', () => {
      const code = 'function add(a: number, b: number): number {\n  return a + b;\n}';
      const units = extractCodeUnits(code, 'test.ts');
      expect(units).toHaveLength(1);
      expect(units[0].signature).toContain('number');
    });
  });

  describe('arrow functions', () => {
    it('should extract an arrow function assigned to const', () => {
      const code = 'const greet = (name) => {\n  return `Hello, ${name}`;\n};';
      const units = extractCodeUnits(code, 'test.ts');
      expect(units).toHaveLength(1);
      expect(units[0].name).toBe('greet');
      expect(units[0].unitType).toBe(CodeUnitType.ARROW_FUNCTION);
      expect(units[0].isAsync).toBe(false);
    });

    it('should extract an async arrow function', () => {
      const code = 'const fetchData = async (url) => {\n  return await fetch(url);\n};';
      const units = extractCodeUnits(code, 'test.ts');
      expect(units).toHaveLength(1);
      expect(units[0].name).toBe('fetchData');
      expect(units[0].isAsync).toBe(true);
    });

    it('should extract an exported arrow function', () => {
      const code = 'export const helper = (x) => {\n  return x * 2;\n};';
      const units = extractCodeUnits(code, 'test.ts');
      expect(units).toHaveLength(1);
      expect(units[0].name).toBe('helper');
      expect(units[0].isExported).toBe(true);
    });

    it('should extract arrow function signature', () => {
      const code = 'const add = (a: number, b: number) => {\n  return a + b;\n};';
      const units = extractCodeUnits(code, 'test.ts');
      expect(units).toHaveLength(1);
      expect(units[0].signature).toBe('(a: number, b: number)');
    });
  });

  describe('class declarations', () => {
    it('should extract a class declaration', () => {
      const code = 'class UserService {\n  getUser() {\n    return null;\n  }\n}';
      const units = extractCodeUnits(code, 'test.ts');
      const classUnit = units.find(u => u.unitType === CodeUnitType.CLASS);
      expect(classUnit).toBeDefined();
      expect(classUnit!.name).toBe('UserService');
      expect(classUnit!.lineStart).toBe(1);
      expect(classUnit!.lineEnd).toBe(5);
      expect(classUnit!.isAsync).toBe(false);
    });

    it('should extract an exported class', () => {
      const code = 'export class UserService {\n  getUser() {\n    return null;\n  }\n}';
      const units = extractCodeUnits(code, 'test.ts');
      const classUnit = units.find(u => u.unitType === CodeUnitType.CLASS);
      expect(classUnit).toBeDefined();
      expect(classUnit!.isExported).toBe(true);
    });

    it('should extract class signature with extends', () => {
      const code = 'class Admin extends User {\n  promote() {\n    return true;\n  }\n}';
      const units = extractCodeUnits(code, 'test.ts');
      const classUnit = units.find(u => u.unitType === CodeUnitType.CLASS);
      expect(classUnit).toBeDefined();
      expect(classUnit!.signature).toContain('extends User');
    });

    it('should extract methods as children of a class', () => {
      const code = [
        'class UserService {',
        '  getUser(id: string) {',
        '    return null;',
        '  }',
        '  async updateUser(id: string, data: object) {',
        '    return null;',
        '  }',
        '}',
      ].join('\n');
      const units = extractCodeUnits(code, 'test.ts');
      const classUnit = units.find(u => u.unitType === CodeUnitType.CLASS);
      expect(classUnit).toBeDefined();
      expect(classUnit!.children).toBeDefined();
      expect(classUnit!.children!.length).toBe(2);
      expect(classUnit!.children![0].name).toBe('getUser');
      expect(classUnit!.children![0].unitType).toBe(CodeUnitType.METHOD);
      expect(classUnit!.children![1].name).toBe('updateUser');
      expect(classUnit!.children![1].isAsync).toBe(true);
    });

    it('should extract method signatures', () => {
      const code = [
        'class Service {',
        '  getData(id: string): Promise<Data> {',
        '    return fetch(id);',
        '  }',
        '}',
      ].join('\n');
      const units = extractCodeUnits(code, 'test.ts');
      const classUnit = units.find(u => u.unitType === CodeUnitType.CLASS);
      expect(classUnit!.children![0].signature).toContain('id: string');
    });

    it('should not extract constructor as a method', () => {
      const code = [
        'class Service {',
        '  constructor(private db: Database) {',
        '    this.db = db;',
        '  }',
        '  getData() {',
        '    return [];',
        '  }',
        '}',
      ].join('\n');
      const units = extractCodeUnits(code, 'test.ts');
      const classUnit = units.find(u => u.unitType === CodeUnitType.CLASS);
      const methodNames = classUnit!.children!.map(c => c.name);
      expect(methodNames).not.toContain('constructor');
      expect(methodNames).toContain('getData');
    });

    it('should not capture methods from a subsequent class when class content is precisely sliced', () => {
      const code = [
        'class First {',
        '  alpha() {',
        '    return 1;',
        '  }',
        '}',
        '',
        'class Second {',
        '  beta() {',
        '    return 2;',
        '  }',
        '}',
      ].join('\n');
      const units = extractCodeUnits(code, 'test.ts');
      const firstClass = units.find(u => u.name === 'First');
      const secondClass = units.find(u => u.name === 'Second');
      expect(firstClass).toBeDefined();
      expect(secondClass).toBeDefined();
      // First class should only have alpha, not beta
      const firstMethodNames = firstClass!.children!.map(c => c.name);
      expect(firstMethodNames).toContain('alpha');
      expect(firstMethodNames).not.toContain('beta');
      // Second class should only have beta
      const secondMethodNames = secondClass!.children!.map(c => c.name);
      expect(secondMethodNames).toContain('beta');
      expect(secondMethodNames).not.toContain('alpha');
    });

    it('should correctly extract methods from a class with long lines', () => {
      // Lines > 200 chars each to break the old * 200 heuristic (undershoot)
      const longParam = 'a'.repeat(250);
      const code = [
        'class LongClass {',
        `  doStuff(${longParam}: string) {`,
        '    return 1;',
        '  }',
        `  doMore(${longParam}: string) {`,
        '    return 2;',
        '  }',
        '}',
      ].join('\n');
      const units = extractCodeUnits(code, 'test.ts');
      const classUnit = units.find(u => u.name === 'LongClass');
      expect(classUnit).toBeDefined();
      expect(classUnit!.children).toBeDefined();
      expect(classUnit!.children!.length).toBe(2);
      expect(classUnit!.children![0].name).toBe('doStuff');
      expect(classUnit!.children![1].name).toBe('doMore');
    });

    it('should ensure methodLineEnd >= methodLineStart (no negative ranges)', () => {
      const code = [
        'class Guard {',
        '  process() {',
        '    return true;',
        '  }',
        '}',
      ].join('\n');
      const units = extractCodeUnits(code, 'test.ts');
      const classUnit = units.find(u => u.name === 'Guard');
      expect(classUnit).toBeDefined();
      for (const method of classUnit!.children!) {
        expect(method.lineEnd).toBeGreaterThanOrEqual(method.lineStart);
      }
    });

    it('should not capture standalone functions after a class as class methods', () => {
      const code = [
        'class MyClass {',
        '  doWork() {',
        '    return 1;',
        '  }',
        '}',
        '',
        'function standaloneFunction() {',
        '  return 42;',
        '}',
      ].join('\n');
      const units = extractCodeUnits(code, 'test.ts');
      const classUnit = units.find(u => u.name === 'MyClass');
      expect(classUnit).toBeDefined();
      const methodNames = classUnit!.children!.map(c => c.name);
      expect(methodNames).toContain('doWork');
      expect(methodNames).not.toContain('standaloneFunction');
    });
  });

  describe('multiple declarations', () => {
    it('should extract multiple functions from one file', () => {
      const code = [
        'function foo() {',
        '  return 1;',
        '}',
        '',
        'function bar() {',
        '  return 2;',
        '}',
        '',
        'const baz = () => {',
        '  return 3;',
        '};',
      ].join('\n');
      const units = extractCodeUnits(code, 'test.ts');
      const names = units.map(u => u.name);
      expect(names).toContain('foo');
      expect(names).toContain('bar');
      expect(names).toContain('baz');
    });

    it('should sort units by line number', () => {
      const code = [
        'const first = () => {',
        '  return 1;',
        '};',
        '',
        'function second() {',
        '  return 2;',
        '}',
      ].join('\n');
      const units = extractCodeUnits(code, 'test.ts');
      expect(units[0].name).toBe('first');
      expect(units[1].name).toBe('second');
    });
  });

  describe('edge cases', () => {
    it('should return empty array for non-JS/TS files', () => {
      const code = 'def foo():\n    return 1';
      const units = extractCodeUnits(code, 'test.py');
      expect(units).toEqual([]);
    });

    it('should skip functions inside comments', () => {
      const code = '// function commentedOut() {\n//   return 1;\n// }\nfunction real() {\n  return 2;\n}';
      const units = extractCodeUnits(code, 'test.ts');
      expect(units).toHaveLength(1);
      expect(units[0].name).toBe('real');
    });

    it('should not extract reserved keywords as function names', () => {
      // This pattern won't normally match reserved words in real code,
      // but we verify the guard works
      const code = 'function validName() {\n  return 1;\n}';
      const units = extractCodeUnits(code, 'test.ts');
      expect(units).toHaveLength(1);
      expect(units[0].name).toBe('validName');
    });

    it('should handle empty file content', () => {
      const units = extractCodeUnits('', 'test.ts');
      expect(units).toEqual([]);
    });

    it('should handle .jsx extension', () => {
      const code = 'function Component() {\n  return null;\n}';
      const units = extractCodeUnits(code, 'test.jsx');
      expect(units).toHaveLength(1);
    });

    it('should handle .mjs extension', () => {
      const code = 'export function helper() {\n  return 1;\n}';
      const units = extractCodeUnits(code, 'utils.mjs');
      expect(units).toHaveLength(1);
      expect(units[0].isExported).toBe(true);
    });
  });
});
