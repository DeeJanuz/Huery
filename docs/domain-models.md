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

## Deep Structural Analysis Models

### FunctionCall
**Purpose:** Records a function call relationship between code units, forming the call graph.

**Properties:**
- id: string - Primary key
- callerUnitId: string - Foreign key to the calling CodeUnit
- calleeName: string - Name of the called function
- calleeFilePath: string? - File path of the callee (if resolved)
- calleeUnitId: string? - Foreign key to the called CodeUnit (if resolved)
- lineNumber: number - Line where the call occurs
- isAsync: boolean - Whether the call is async (await)

**Indexes:**
- callerUnitId (for "what does this function call?")
- calleeName (for "who calls this function name?")
- calleeUnitId (for "who calls this resolved unit?")

---

### TypeField
**Purpose:** Records fields/properties of interfaces, types, classes, and structs for structural analysis.

**Properties:**
- id: string - Primary key
- parentUnitId: string - Foreign key to the parent CodeUnit (interface, class, etc.)
- name: string - Field name
- fieldType: string - Type annotation of the field
- isOptional: boolean - Whether the field is optional
- isReadonly: boolean - Whether the field is readonly
- lineNumber: number - Line where the field is declared

**Indexes:**
- parentUnitId (for "what fields does this type have?")

---

### EventFlow
**Purpose:** Records event emission and subscription patterns for event-driven architecture analysis.

**Properties:**
- id: string - Primary key
- codeUnitId: string - Foreign key to CodeUnit
- eventName: string - Name of the event
- direction: 'emit' | 'subscribe' - Whether the unit emits or subscribes to the event
- framework: string - Event framework (node-events, socket.io, etc.)
- lineNumber: number - Line where the event interaction occurs

**Indexes:**
- codeUnitId (for "what events does this function use?")
- eventName (for "who emits/subscribes to this event?")

---

### SchemaModel
**Purpose:** Records ORM/schema model definitions extracted from framework-specific schema files (Prisma, TypeORM, Mongoose, Drizzle, etc.).

**Properties:**
- id: string - Primary key
- name: string - Model name (e.g., "User", "Order")
- filePath: string - Path to the schema file
- framework: string - ORM framework (prisma, typeorm, mongoose, drizzle)
- tableName: string? - Database table name if specified
- fields: SchemaModelField[] - Fields belonging to this model

**Indexes:**
- filePath (for file-level queries)

---

### SchemaModelField
**Purpose:** Records individual fields within a schema model, including type, constraints, and relations.

**Properties:**
- id: string - Primary key
- modelId: string - Foreign key to SchemaModel
- name: string - Field name
- fieldType: string - Field type (String, Int, DateTime, etc.)
- isPrimaryKey: boolean - Whether this is a primary key
- isRequired: boolean - Whether the field is required
- isUnique: boolean - Whether the field has a unique constraint
- hasDefault: boolean - Whether the field has a default value
- relationTarget: string? - Target model name for relation fields

**Indexes:**
- modelId (for "what fields does this model have?")

---

### UnitSummary
**Purpose:** Stores LLM-generated summaries of code units, produced by the BYOK enrichment pipeline.

**Properties:**
- id: string - Primary key
- codeUnitId: string - Foreign key to CodeUnit (unique)
- summary: string - AI-generated summary of what the function does
- keyBehaviors: string[] - List of key behaviors
- sideEffects: string[] - List of side effects
- providerModel: string - LLM provider and model used (e.g., "anthropic/claude-sonnet-4-20250514")
- generatedAt: string - ISO timestamp of generation

**Unique Constraint:** (codeUnitId)

**Indexes:**
- codeUnitId (for lookup by code unit)

---

### RepositoryGuardClause
**Purpose:** Records guard clauses (early returns, null checks, auth checks, validation) detected within function bodies. Previously extracted but discarded; now persisted for MCP tool queries.

**Properties:**
- id: string - Primary key
- codeUnitId: string - Foreign key to CodeUnit
- guardType: string - Type of guard (e.g., "null_check", "type_check", "validation")
- condition: string - The guard condition expression or error type
- lineNumber: number - Line where the guard clause occurs

**Indexes:**
- codeUnitId (for "what guards does this function have?")
- guardType (for "find all guards of this type")

**Validation:**
- codeUnitId must not be empty
- guardType must not be empty
- condition must not be empty
- lineNumber must be >= 1

---

### RepositoryFileCluster
**Purpose:** Represents a cluster of files that form a cohesive feature area, computed by connected-component analysis on the import graph.

**Properties:**
- id: string - Primary key
- name: string - Auto-computed name from common directory prefix (strips infrastructure segments like src/lib/app)
- cohesion: number - Ratio of internal edges to total edges (0..1); higher means more self-contained
- internalEdges: number - Count of import edges between files within the cluster
- externalEdges: number - Count of import edges crossing the cluster boundary

**Validation:**
- name must not be empty
- cohesion must be between 0 and 1
- internalEdges must be >= 0
- externalEdges must be >= 0

---

### RepositoryFileClusterMember
**Purpose:** Records membership of a file in a cluster, including whether it is an entry point (imported from outside the cluster).

**Properties:**
- clusterId: string - Foreign key to RepositoryFileCluster
- filePath: string - Path of the file within the cluster
- isEntryPoint: boolean - Whether this file is imported by files outside the cluster (top 3 by external import count)

**Unique Constraint:** (clusterId, filePath)

**Indexes:**
- file_path (for "which cluster contains this file?")

---

### RepositoryPatternTemplate
**Purpose:** Represents a detected recurring pattern combination (convention) with a canonical example (template) and a count of followers. Computed by analyzing code units that share the same set of pattern types.

**Properties:**
- id: string - Primary key
- name: string - Auto-derived name from pattern types (e.g., "Api Endpoint with Database Write")
- description: string - Human-readable description with occurrence count
- patternTypes: string[] - Sorted list of PatternType values that define the combination
- templateUnitId: string - Foreign key to the canonical CodeUnit example
- templateFilePath: string - File path of the template code unit
- followerCount: number - Number of code units following this pattern (excludes the template)
- conventions: string[] - Derived convention descriptions (up to 3)

**Validation:**
- name must not be empty
- description must not be empty
- templateUnitId must not be empty
- templateFilePath must not be empty
- followerCount must be >= 0
- patternTypes must be an array
- conventions must be an array

---

### RepositoryPatternTemplateFollower
**Purpose:** Records a code unit that follows a pattern template (i.e., shares the same pattern type combination as the template).

**Properties:**
- templateId: string - Foreign key to RepositoryPatternTemplate
- filePath: string - Path of the follower file
- unitName: string - Name of the follower code unit

**Unique Constraint:** (templateId, filePath, unitName)

**Validation:**
- templateId must not be empty
- filePath must not be empty
- unitName must not be empty

---

## Deep Structural Ports (Repository Interfaces)

### IFunctionCallRepository
**Methods:**
- save(call: FunctionCall): void
- saveBatch(calls: FunctionCall[]): void
- findByCallerUnitId(callerUnitId: string): FunctionCall[]
- findByCalleeName(calleeName: string): FunctionCall[]
- findByCalleeUnitId(calleeUnitId: string): FunctionCall[]
- findAll(): FunctionCall[]
- deleteByCallerUnitId(callerUnitId: string): void
- clear(): void

### ITypeFieldRepository
**Methods:**
- save(field: TypeField): void
- saveBatch(fields: TypeField[]): void
- findByParentUnitId(parentUnitId: string): TypeField[]
- findAll(): TypeField[]
- deleteByParentUnitId(parentUnitId: string): void
- clear(): void

### IEventFlowRepository
**Methods:**
- save(flow: EventFlow): void
- saveBatch(flows: EventFlow[]): void
- findByCodeUnitId(codeUnitId: string): EventFlow[]
- findByEventName(eventName: string): EventFlow[]
- findAll(): EventFlow[]
- deleteByCodeUnitId(codeUnitId: string): void
- clear(): void

### ISchemaModelRepository
**Methods:**
- save(model: SchemaModel): void
- saveBatch(models: SchemaModel[]): void
- findById(id: string): SchemaModel | undefined
- findByName(name: string): SchemaModel | undefined
- findByFilePath(filePath: string): SchemaModel[]
- findByFramework(framework: string): SchemaModel[]
- findAll(): SchemaModel[]
- deleteByFilePath(filePath: string): void
- clear(): void

### IUnitSummaryRepository
**Methods:**
- save(summary: UnitSummary): void
- saveBatch(summaries: UnitSummary[]): void
- findByCodeUnitId(codeUnitId: string): UnitSummary | undefined
- findAll(): UnitSummary[]
- deleteByCodeUnitId(codeUnitId: string): void
- clear(): void

### IGuardClauseRepository
**Methods:**
- save(guard: RepositoryGuardClause): void
- saveBatch(guards: RepositoryGuardClause[]): void
- findByCodeUnitId(codeUnitId: string): RepositoryGuardClause[]
- findByGuardType(guardType: string): RepositoryGuardClause[]
- findAll(): RepositoryGuardClause[]
- deleteByCodeUnitId(codeUnitId: string): void
- clear(): void

### IFileClusterRepository
**Methods:**
- save(cluster: RepositoryFileCluster, members: RepositoryFileClusterMember[]): void
- saveBatch(clusters: Array<{ cluster: RepositoryFileCluster; members: RepositoryFileClusterMember[] }>): void
- findById(id: string): { cluster: RepositoryFileCluster; members: RepositoryFileClusterMember[] } | undefined
- findByFilePath(filePath: string): { cluster: RepositoryFileCluster; members: RepositoryFileClusterMember[] } | undefined
- findByName(name: string): { cluster: RepositoryFileCluster; members: RepositoryFileClusterMember[] }[]
- findAll(): { cluster: RepositoryFileCluster; members: RepositoryFileClusterMember[] }[]
- clear(): void

### IPatternTemplateRepository
**Methods:**
- save(template: RepositoryPatternTemplate, followers: RepositoryPatternTemplateFollower[]): void
- saveBatch(templates: Array<{ template: RepositoryPatternTemplate; followers: RepositoryPatternTemplateFollower[] }>): void
- findById(id: string): { template: RepositoryPatternTemplate; followers: RepositoryPatternTemplateFollower[] } | undefined
- findByPatternType(patternType: string): { template: RepositoryPatternTemplate; followers: RepositoryPatternTemplateFollower[] }[]
- findAll(): { template: RepositoryPatternTemplate; followers: RepositoryPatternTemplateFollower[] }[]
- clear(): void

### ILlmProvider
**Purpose:** Port for BYOK LLM providers used by the enrichment pipeline to generate code unit summaries.

**Properties:**
- providerModel: string (readonly) - Provider and model identifier

**Methods:**
- generateSummary(prompt: string): Promise<string>

### LlmProviderConfig
**Properties:**
- provider: 'anthropic' | 'openai' | 'gemini'
- apiKey: string
- model: string? - Optional model override
- maxTokens: number? - Optional max tokens
- baseUrl: string? - Optional base URL override

---

## Embedding Models

### EmbeddingTextContext
**Purpose:** Enriched context for building search-optimized embedding text. Wraps a CodeUnit with additional structural data from the call graph, event flows, LLM summaries, and file clusters.

**Properties:**
- unit: CodeUnit - The code unit to embed
- summary: string? - LLM-generated summary (truncated to 50 words in output)
- callers: string[]? - Names of functions that call this unit
- callees: string[]? - Names of functions this unit calls
- events: string[]? - Event names emitted or subscribed by this unit
- clusterName: string? - Name of the feature area cluster this unit belongs to

**Used by:** `buildEmbeddingText()` in `src/adapters/embedding/embedding-text-builder.ts`

---

### EmbeddingPipelineDependencies
**Purpose:** Dependencies for the EmbeddingPipeline application service.

**Properties:**
- codeUnitRepo: ICodeUnitRepository - Required
- embeddingProvider: IEmbeddingProvider - Required
- vectorSearch: IVectorSearchService - Required
- unitSummaryRepo: IUnitSummaryRepository? - Optional, for enriching embeddings with LLM summaries
- functionCallRepo: IFunctionCallRepository? - Optional, for enriching embeddings with caller/callee data
- eventFlowRepo: IEventFlowRepository? - Optional, for enriching embeddings with event names
- fileClusterRepo: IFileClusterRepository? - Optional, for enriching embeddings with cluster names

---

## Model Relationships

```
CodeUnit (1) ----< (many) CodeUnitPattern
CodeUnit (1) ----< (many) CodeUnit (parent-child hierarchy)
CodeUnitPattern (1) ---- (0..1) ApiEndpointSpec
FileDependency: sourceFile >---- targetFile (file-level graph)

Deep Structural Analysis:
CodeUnit (1) ----< (many) FunctionCall (as caller, via callerUnitId)
CodeUnit (0..1) ----< (many) FunctionCall (as callee, via calleeUnitId)
CodeUnit (1) ----< (many) TypeField (via parentUnitId)
CodeUnit (1) ----< (many) EventFlow (via codeUnitId)
CodeUnit (1) ---- (0..1) UnitSummary (via codeUnitId, unique)
CodeUnit (1) ----< (many) RepositoryGuardClause (via codeUnitId)
SchemaModel (1) ----< (many) SchemaModelField (via modelId)

File Clustering:
RepositoryFileCluster (1) ----< (many) RepositoryFileClusterMember (via clusterId)
FileDependency graph --> computeFileClusters() --> RepositoryFileCluster + members

Pattern Templates:
RepositoryPatternTemplate (1) ----< (many) RepositoryPatternTemplateFollower (via templateId)
CodeUnit (1) ---- (0..1) RepositoryPatternTemplate (as template, via templateUnitId)
CodeUnit patterns --> detectPatternTemplates() --> RepositoryPatternTemplate + followers
```
