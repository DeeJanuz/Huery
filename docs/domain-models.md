# Domain Models Documentation

This document maps the core domain models for heury's code analysis system.

---

## Core Analysis Models

### CodeUnit
**Purpose:** Represents an extracted code construct (function, class, method, etc.) from analyzed source code.

**Properties:**
- id: string - Primary key
- filePath: string - Path within the analyzed codebase
- name: string - Name of the code unit
- unitType: CodeUnitType - Type of construct
- lineStart: number - Start line in source file
- lineEnd: number - End line in source file
- parentUnitId: string? - Parent code unit (for methods inside classes)
- signature: string? - Type signature (e.g., "(userId: string) => Promise<User>")
- isAsync: boolean - Whether the unit is async
- isExported: boolean - Whether the unit is exported
- language: string - Language identifier (e.g., "javascript-typescript", "python", "go")
- complexity: Record<string, number> - Raw complexity metrics
- complexityScore: number - Aggregate complexity score
- patterns: CodeUnitPattern[] - Detected patterns within this unit
- children: CodeUnit[] - Child code units (methods of a class)

**Unique Constraint:** (filePath, name, unitType, lineStart)

**Indexes:**
- filePath (for file-level queries)
- unitType (for type filtering)
- complexityScore (for sorting by complexity)
- language (for language filtering)

---

### CodeUnitType (Enum)
```
MODULE          // File-level (aggregates imports, exports, top-level patterns)
FUNCTION        // Named function declaration
ARROW_FUNCTION  // Arrow function assigned to variable
CLASS           // Class declaration
METHOD          // Method inside a class
STRUCT          // Struct declaration (Go, Rust, C#)
TRAIT           // Trait/interface declaration (Rust)
INTERFACE       // Interface declaration (Java, C#, Go)
ENUM            // Enum declaration (Rust, Java, C#, TypeScript)
IMPL_BLOCK      // Implementation block (Rust impl)
TYPE_ALIAS      // Type alias declaration (TypeScript)
```

---

### CodeUnitPattern
**Purpose:** Records a specific pattern detected within a code unit (API endpoint, database call, external service usage, etc.)

**Properties:**
- id: string - Primary key
- codeUnitId: string - Foreign key to CodeUnit
- patternType: PatternType - Category of pattern
- patternValue: string - Specific pattern value (e.g., "/api/users", "prisma.user.create")
- lineNumber: number? - Line within the function where pattern occurs
- columnAccess: JSON? - Column-level access tracking: {"read": ["id", "email"], "write": ["name"]}

**Indexes:**
- codeUnitId
- patternType
- patternValue
- (patternType, patternValue) - Combined for queries like "find all database writes"

---

### PatternType (Enum)
```
API_ENDPOINT      // Exposes an API route (GET /api/users)
API_CALL          // Calls an external API (fetch, axios)
DATABASE_READ     // Database read operation (prisma.user.findMany)
DATABASE_WRITE    // Database write operation (prisma.user.create)
EXTERNAL_SERVICE  // SDK usage (stripe.checkout, openai.chat)
ENV_VARIABLE      // Environment variable access (process.env.X)
IMPORT            // Import from module
EXPORT            // Export to consumers
```

---

### FileDependency
**Purpose:** Records import/dependency relationships between files in the codebase.

**Properties:**
- id: string - Primary key
- sourceFile: string - File that imports
- targetFile: string - File being imported
- importType: ImportType - Type of import
- importedNames: string[] - What is imported (e.g., ["User", "createUser"])

**Unique Constraint:** (sourceFile, targetFile)

**Indexes:**
- sourceFile (for "what does this file import?")
- targetFile (for "what imports this file?")

---

### ImportType (Enum)
```
NAMED       // import { x } from 'y'
DEFAULT     // import x from 'y'
NAMESPACE   // import * as x from 'y'
DYNAMIC     // import('y')
PACKAGE     // Go/Java package import
MODULE      // Python/Rust module import
WILDCARD    // Wildcard import (import * / from x import *)
```

---

### RepositoryEnvVariable
**Purpose:** Records environment variables discovered in .env.example or similar files.

**Properties:**
- id: string - Primary key
- name: string - Variable name (e.g., "DATABASE_URL")
- description: string? - Description from comments
- hasDefault: boolean - Whether a default value is provided
- lineNumber: number - Line in the env file

**Unique Constraint:** (name) per analysis run

---

### ApiEndpointSpec
**Purpose:** Detailed API endpoint specification extracted from code analysis, enriching API_ENDPOINT patterns with structured metadata.

**Properties:**
- id: string - Primary key
- patternId: string - Foreign key to CodeUnitPattern (with API_ENDPOINT type)
- httpMethod: HttpMethod - GET, POST, PUT, PATCH, DELETE, etc.
- routePath: string - The route path (e.g., "/api/users/:id")
- requestBodySchema: JSON? - Expected request body structure
- responseSchema: JSON? - Expected response structure
- queryParams: JSON? - Expected query parameters
- pathParams: string[] - Path parameter names
- middlewareChain: string[] - Middleware applied to this endpoint
- authRequired: boolean - Whether authentication is required

---

### HttpMethod (Enum)
```
GET
POST
PUT
PATCH
DELETE
HEAD
OPTIONS
```

---

## Analysis Pipeline Models

### AnalysisResult
**Purpose:** Result returned after processing a codebase analysis run.

**Properties:**
- success: boolean
- error: string? - Error message if failed
- stats: AnalysisStats? - Statistics from the analysis

### AnalysisStats
**Purpose:** Aggregate statistics from a completed analysis.

**Properties:**
- filesProcessed: number
- codeUnitsExtracted: number
- patternsDetected: number
- dependenciesFound: number
- envVariablesFound: number
- filesWithErrors: number - Count of files that failed during processing
- duration: number - Time in milliseconds

---

## Complexity Models

### ComplexityMetrics
**Purpose:** Detailed complexity metrics calculated for each code unit.

**Properties:**
- conditionals: number - Count of if/else/ternary branching
- loops: number - Count of for/while/do-while loops
- maxNestingDepth: number - Deepest nesting level
- tryCatchBlocks: number - Count of try/catch blocks
- asyncPatterns: number - Count of async/await patterns
- callbackDepth: number - Depth of callback nesting
- parameterCount: number - Number of function parameters
- lineCount: number - Total lines of code

**Related Functions:**
- `calculateComplexityScore(metrics)` - Weighted aggregate score
- `getComplexityLevel(score)` - Returns 'simple' (<=15), 'moderate' (<=35), or 'complex'
- `createEmptyMetrics()` - Factory for zero-initialized metrics

---

## Extraction Service Interfaces

### LanguageExtractor
**Purpose:** Interface for language-specific code extraction. Each supported language implements this interface.

**Properties:**
- languageId: string - Language identifier (e.g., "javascript-typescript", "python")
- extensions: string[] - File extensions handled by this extractor

**Methods:**
- extractCodeUnits(content: string, filePath: string): CodeUnitDeclaration[]
- extractDependencies(content: string, filePath: string): FileDependencyInfo[]
- getPatternRules(): PatternRuleSet
- getComplexityPatterns(): LanguageComplexityPatterns
- getSkipDirectories(): string[]
- isTestFile(filePath: string): boolean

### CodeUnitDeclaration
**Purpose:** Raw extraction result before storage.

**Properties:**
- name: string
- unitType: CodeUnitType
- lineStart: number
- lineEnd: number
- signature: string?
- isAsync: boolean
- isExported: boolean
- children: CodeUnitDeclaration[]? - Nested declarations (methods inside classes)
- body: string? - Extracted source text of the code block

### FileDependencyInfo
**Purpose:** Raw dependency extraction result.

**Properties:**
- targetFile: string
- importType: ImportType
- importedNames: string[]

### DetectedPattern
**Purpose:** A pattern detected during code analysis.

**Properties:**
- patternType: PatternType
- patternValue: string
- lineNumber: number?
- columnAccess: { read: string[]; write: string[] }?

### PatternRule
**Purpose:** A single regex-based pattern matching rule.

**Properties:**
- pattern: RegExp
- patternType: PatternType
- value: string? - Static pattern value
- extractValue: (match: RegExpMatchArray) => string? - Dynamic value extractor

### PatternRuleSet
**Purpose:** Complete set of pattern rules for a language.

**Properties:**
- apiEndpoints: PatternRule[]
- apiCalls: PatternRule[]
- databaseReads: PatternRule[]
- databaseWrites: PatternRule[]
- externalServices: PatternRule[]
- envVariables: PatternRule[]

### LanguageComplexityPatterns
**Purpose:** Language-specific regex patterns for complexity calculation.

**Properties:**
- conditionals: RegExp[]
- loops: RegExp[]
- errorHandling: RegExp[]
- asyncPatterns: RegExp[]

---

## Model Relationships

```
CodeUnit (1) ----< (many) CodeUnitPattern
CodeUnit (1) ----< (many) CodeUnit (parent-child hierarchy)
CodeUnitPattern (1) ---- (0..1) ApiEndpointSpec
FileDependency: sourceFile >---- targetFile (file-level graph)
```
