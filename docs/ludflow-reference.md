# Ludflow Analysis Architecture Reference

This document summarizes the key architectural concepts from Ludflow's codebase analysis system that are being ported to heury. It serves as a reference for understanding the design decisions and patterns that inform heury's architecture.

---

## Analysis Orchestrator Pipeline

Ludflow's analysis runs a single-pass pipeline over all code files in a repository:

1. **Get or create analysis record** - Track analysis state (pending, analyzing, completed, failed)
2. **Clear existing analysis data** - Clean slate for re-analysis
3. **Process each code file:**
   - a. Extract code units (functions, classes, methods) via language-specific extractors
   - b. Calculate complexity metrics for each code unit
   - c. Detect patterns (API calls, DB operations, etc.) within each code unit
   - d. Extract file-level dependencies (imports)
4. **Detect module-level patterns** - Patterns in file-scope code not captured by any extracted code unit (e.g., Express routes defined outside functions)
5. **Process env files** - Extract environment variable declarations from .env.example files
6. **Store results** in CodeUnit, CodeUnitPattern, and FileDependency tables

The pipeline is chunked for large repositories, processing batches of files to manage memory and enable progress tracking.

---

## Heuristic Extraction System

The core of the analysis is a set of heuristic extractors that work on source code text (no AST parsing). Each extractor uses regex patterns and text analysis:

### Function Extractor
- Extracts named functions, arrow functions, classes, methods, structs, traits, interfaces, enums, impl blocks
- Language-aware: dispatches to language-specific extractors when available
- Extracts code blocks for each declaration (used by complexity calculator and pattern detector)
- Captures metadata: name, type, line range, signature, async status, export status

### Pattern Detector
- Scans code blocks for known patterns using regex rules
- Built-in pattern types: API_ENDPOINT, API_CALL, DATABASE_READ, DATABASE_WRITE, EXTERNAL_SERVICE, ENV_VARIABLE, IMPORT, EXPORT
- Language-specific rules extend the base pattern set (e.g., Python's Django ORM patterns)
- Tracks column-level access for database operations (which columns are read/written)

### Complexity Calculator
- Calculates cyclomatic complexity metrics from code text
- Counts branching statements (if, else, switch, for, while, try/catch)
- Produces an aggregate complexity score for ranking

### Dependency Extractor
- Parses import/require statements to build a file dependency graph
- Classifies import types: named, default, namespace, dynamic, package, module, wildcard
- Tracks imported names for each dependency
- Language-specific: handles ES modules, CommonJS, Python imports, Go imports, etc.

---

## Language Registry Pattern

The language registry is a central singleton that manages language-specific extractors:

```
LanguageRegistry
  |
  |-- register(extractor: ILanguageExtractor)
  |-- getByExtension(ext: string): ILanguageExtractor | null
  |-- getSupportedExtensions(): string[]
  |-- getAllSkipDirectories(): string[]
  |-- isTestFile(filePath: string): boolean
```

**Registered languages in Ludflow:**
- JavaScript/TypeScript (.js, .ts, .jsx, .tsx)
- Python (.py)
- Go (.go)
- Rust (.rs)
- Java (.java)
- C# (.cs)

**Each language extractor implements:**
- `extractCodeUnits(content, filePath)` - Language-specific function/class extraction
- `extractDependencies(content, filePath)` - Language-specific import parsing
- `getPatternRules()` - Language-specific pattern detection rules
- Extension and test file detection

The registry follows OCP: new languages are added by creating an extractor class and registering it, without modifying existing code.

---

## Code Unit Model

The CodeUnit is the fundamental unit of analysis. It represents any named code construct:

- **MODULE** - File-level pseudo-unit for top-level patterns
- **FUNCTION** - Named function declarations
- **ARROW_FUNCTION** - Arrow functions assigned to variables
- **CLASS** - Class declarations
- **METHOD** - Methods inside classes
- **STRUCT, TRAIT, INTERFACE, ENUM, IMPL_BLOCK** - Language-specific constructs

Each code unit has:
- Location (file path, line range)
- Metadata (signature, async, exported, language)
- Complexity metrics
- Detected patterns (many-to-many via CodeUnitPattern)
- Hierarchical parent-child relationships (methods belong to classes)

---

## MCP Tool Architecture

Ludflow exposes analysis data through 18 MCP (Model Context Protocol) tools, organized around a discovery-first workflow:

### Tool Categories

**Discovery tools** (start here):
- `get_analysis_stats` - Overview of what was analyzed (counts by type, pattern, complexity)
- `get_module_overview` - High-level view of modules/files
- `search_codebase` - Keyword search across code units

**Read tools** (targeted retrieval):
- `get_file_content` - Source code of specific files (batch up to 10)
- `get_code_units` - Code units with optional source code inclusion
- `get_endpoint_detail` - Detailed API endpoint information
- `get_dependencies` - Import/dependency graph
- `get_api_endpoints` - All API endpoints with specs
- `get_data_schema` - Database schema metadata
- `get_business_concepts` - Business domain concepts
- `get_column_context` - Column-level data access patterns

**Verify tools** (cross-reference):
- `vector_search` - Semantic search across code units

**Document tools:**
- `list_documents`, `get_document`, `write_document`
- `manage_document_links`, `manage_folders`
- `manage_data_draft`

### Tool Registry Pattern

Tools follow OCP via a registry pattern:
```typescript
const toolHandlers: Record<string, ToolHandler> = {
  'get_analysis_stats': handleGetAnalysisStats,
  'get_code_units': handleGetCodeUnits,
  // ... add new tools by adding entries
};
```

Each tool is self-contained with its own definition (schema) and handler function.

---

## Discover -> Read -> Verify Workflow

The MCP server instructs LLMs to follow a three-phase workflow when exploring a codebase:

### 1. DISCOVER
Start broad. Understand the landscape before diving in.
- `get_analysis_stats` - What does this codebase contain?
- `get_module_overview` or `search_codebase` (compact format) - What are the major modules?

### 2. READ
Target specific code based on discovery results.
- `get_file_content` - Read source code (batch up to 10 files)
- `get_code_units` (with include_source=true) - Get function bodies
- `get_endpoint_detail` - Deep dive into API endpoints

### 3. VERIFY
Cross-reference and validate understanding.
- `get_dependencies` - Check import relationships
- `search_codebase` (with exclude_ids) - Find related code not yet seen
- `vector_search` - Semantic similarity for "what else does something like this?"

This workflow prevents LLMs from making assumptions based on incomplete information. Each phase narrows the search space and increases confidence.

---

## Vector Search Integration

Vector search complements keyword search by finding semantically similar code:

- Code units are embedded using their metadata + source preview
- Embeddings are stored in a vector index (Ludflow uses pgvector; heury will use local alternatives)
- Search combines vector similarity with optional post-filters (file path, pattern type, complexity)
- Results include similarity scores for ranking

**Key design decision:** Embeddings are generated as a separate post-analysis step, not during the main extraction pipeline. This keeps analysis fast and allows re-embedding with different models without re-analyzing.

---

## Key Architectural Patterns to Port

1. **Single-pass analysis pipeline** - Extract everything in one traversal per file -- PORTED
2. **Heuristic (regex-based) extraction** - No AST parsing, works across languages -- PORTED
3. **Language registry** - Extensible language support via OCP -- PORTED
4. **Pattern detection** - Categorized code pattern recognition -- PORTED
5. **MCP tool interface** - Structured access to analysis data for LLMs -- PORTED (12 tools)
6. **Discover-read-verify workflow** - Guided exploration pattern -- PORTED
7. **Port/adapter pattern** - Abstract storage, embedding providers, and search backends -- PORTED
8. **Module-level pattern detection** - Catch patterns in file-scope code outside functions -- PORTED
9. **Deep structural analysis** - Call graphs, type fields, event flows, schema models, guards -- PORTED (Path C)
10. **LLM enrichment** - AI-generated function summaries -- REMOVED (ADR-008: redundant with raw data exposed via MCP tools; calling LLM agents synthesize understanding on demand)

---

## What Heury Changes from Ludflow

| Ludflow | Heury |
|---------|-------|
| PostgreSQL + Prisma ORM | SQLite (embedded, no server) |
| pgvector for embeddings | Removed (ADR-008); keyword search via `search-codebase` |
| Multi-tenant (organization scoping) | Single-user, local-first |
| Vercel serverless deployment | CLI tool, runs locally |
| Inngest for background jobs | Direct execution (no job queue needed) |
| Encrypted file storage | Direct file system access |
| Stripe billing | Open source, no billing |
| Better Auth | No authentication needed |
| GitHub API integration | Direct file system access to local repos |
