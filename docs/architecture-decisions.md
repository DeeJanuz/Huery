# Architecture Decision Records (ADRs)

**Manually maintained by developers when making significant architectural decisions.**

This document records important architectural decisions, their context, and rationale.

---

## How to Use ADRs

When making a significant architectural decision:
1. Add a new entry below
2. Use the template format
3. Document context, decision, and consequences
4. Update status if decision is superseded

---

## ADR Template

```markdown
## ADR-XXX: [Decision Title]
**Date:** YYYY-MM-DD
**Status:** [Proposed | Accepted | Deprecated | Superseded by ADR-YYY]
**Deciders:** [Names or roles]

### Context
[What is the issue we're facing? What factors influence this decision?]

### Decision
[What did we decide? State clearly.]

### Rationale
[Why did we make this decision? What were the alternatives?]

### Consequences
**Positive:**
- [Good outcomes from this decision]

**Negative:**
- [Drawbacks or trade-offs]

**Neutral:**
- [Other changes or effects]
```

---

## Active Decisions

### ADR-001: Adopt Hexagonal Architecture (Ports & Adapters)
**Date:** 2026-02-26
**Status:** Accepted
**Deciders:** Architecture Team

#### Context
We need an architecture pattern that:
- Keeps business logic isolated from frameworks
- Makes code testable
- Allows swapping infrastructure components (storage backends, vector search providers)
- Supports SOLID principles
- Works well for a local-first tool that may run in different environments

#### Decision
Adopt Hexagonal Architecture (Ports & Adapters) pattern with:
- **Domain Layer:** Pure business logic, no dependencies
- **Application Layer:** Use cases coordinating domain objects
- **Adapter Layer:** Infrastructure implementations (storage, file system, vector search, etc.)
- **Dependency Inversion:** All dependencies point inward toward domain

#### Rationale
**Alternatives considered:**
1. **MVC** - Too coupled to web framework, hard to test business logic
2. **Clean Architecture** - Similar to Hexagonal but more layers, added complexity
3. **Transaction Script** - Too simple, doesn't scale as complexity grows

**Why Hexagonal:**
- Clear separation of concerns
- Domain layer is framework-agnostic
- Easy to test (mock at adapter boundaries)
- Critical for heury: allows swapping storage backends (SQLite, Redis, file-based) without touching business logic
- Aligns with SOLID principles (especially DIP)

#### Consequences
**Positive:**
- Business logic is pure and testable
- Easy to swap storage backends (SQLite for simple use, Redis for performance)
- Clear architectural boundaries
- Better separation of concerns

**Negative:**
- More initial boilerplate
- Steeper learning curve for new contributors
- More files and folders

**Neutral:**
- Need to document patterns clearly
- Contributors need onboarding on patterns

---

### ADR-002: Use TypeScript for Type Safety
**Date:** 2026-02-26
**Status:** Accepted
**Deciders:** Development Team

#### Context
We need strong type safety to:
- Catch errors at compile time
- Improve IDE autocomplete
- Document interfaces clearly
- Reduce runtime errors

#### Decision
Use TypeScript for all application code with strict mode enabled.

#### Rationale
**Alternatives:**
1. **JavaScript with JSDoc** - Types not enforced, easy to ignore
2. **Flow** - Less ecosystem support, smaller community

**Why TypeScript:**
- Industry standard
- Excellent IDE support
- Strong type checking
- Large ecosystem
- Interfaces document contracts

#### Consequences
**Positive:**
- Catch errors at compile time
- Better refactoring confidence
- Self-documenting code
- Improved developer experience

**Negative:**
- Build step required
- Longer initial development time
- Generic/complex types can be confusing

**Neutral:**
- Need to maintain tsconfig.json

---

### ADR-003: Test-Driven Development with Layer-Based Strategy
**Date:** 2026-02-26
**Status:** Accepted
**Deciders:** Development Team

#### Context
We need a testing strategy that:
- Ensures code quality
- Provides confidence for refactoring
- Aligns with Hexagonal Architecture
- Balances speed and coverage

#### Decision
Adopt TDD with layer-based testing:
- **Domain:** Pure unit tests (50% of tests)
- **Application:** Integration tests with mocked ports (30%)
- **Adapters:** Integration tests with real systems (15%)
- **E2E:** Critical path tests (5%)

#### Rationale
**Why layer-based:**
- Aligns with architecture boundaries
- Tests what matters (business logic heavily tested)
- Fast feedback (most tests are fast unit tests)
- Mock only at boundaries (more confidence)

**Alternatives considered:**
1. **Test Pyramid** - Good, but doesn't leverage DIP advantages
2. **All E2E** - Slow, hard to debug, brittle
3. **All Unit** - Misses integration issues

#### Consequences
**Positive:**
- Fast test suite (most tests are unit)
- High confidence from integration tests
- Clear testing strategy per layer
- Regression protection

**Negative:**
- Requires discipline to maintain
- Need test helpers (fakes, builders)
- Integration tests need test infrastructure

**Neutral:**
- TDD adds upfront time but saves debugging time

---

### ADR-004: Local-First Architecture with Lightweight Storage
**Date:** 2026-02-26
**Status:** Accepted
**Deciders:** Architecture Team

#### Context
Heury is a local-first codebase analysis tool. It needs to:
- Run entirely on a developer's machine without cloud dependencies
- Store analysis results efficiently
- Support vector search for semantic code queries
- Be fast to set up with minimal configuration

#### Decision
Use lightweight, local storage backends:
- **SQLite** as the primary relational store (via better-sqlite3 or similar)
- **Local vector search** via in-memory cosine similarity (pure JS, no native deps), upgradeable to hnswlib or sqlite-vss
- **File system** for caching and temporary data
- No cloud database dependencies (no Postgres, PlanetScale, etc.)

#### Rationale
**Alternatives considered:**
1. **PostgreSQL + pgvector** - Requires running a database server, too heavy for a local CLI tool
2. **Redis** - Good for caching but overkill for persistent storage in a local tool
3. **Pure file-based storage (JSON)** - Simple but poor query performance at scale

**Why SQLite + local vector search:**
- Zero-configuration: SQLite is embedded, no server needed
- Fast for read-heavy workloads (code analysis is mostly reads after initial analysis)
- Portable: single file database, easy to move or delete
- In-memory vector search works in-process with zero native dependencies
- Well-supported in Node.js ecosystem

#### Consequences
**Positive:**
- Zero infrastructure setup for users
- Fast startup and analysis
- Portable analysis results (single SQLite file)
- No network dependencies

**Negative:**
- No concurrent write access (SQLite limitation, acceptable for single-user tool)
- In-memory vector search has O(n) complexity; may need indexing (hnswlib/sqlite-vss) for large codebases
- Limited to single-machine use

**Neutral:**
- Hexagonal architecture allows swapping to a remote database later if needed
- May need to benchmark vector search options during implementation

---

### ADR-005: Deep Structural Analysis via Heuristic Extractors
**Date:** 2026-02-28
**Status:** Accepted
**Deciders:** Architecture Team

#### Context
The initial analysis pipeline (Path A/B) extracts code units, patterns, complexity, and dependencies. However, LLMs need deeper structural understanding to reason about code behavior without reading source files:
- Function call relationships (who calls whom)
- Type/interface field definitions (what shapes data takes)
- Event-driven patterns (what events flow between components)
- ORM/schema models (what the data layer looks like)
- Guard conditions (what preconditions functions enforce)

Additionally, LLM-generated function summaries can provide human-readable descriptions that complement the structural data.

#### Decision
Add a Deep Structural Analysis phase (Path C) as a post-processing step after the main analysis pipeline:
- **5 new heuristic extractors:** call graph, type fields, event flows, schema models, guards
- **Import graph clustering:** Connected-component analysis on the file dependency graph with directory-boundary splitting for large components; computes feature areas with cohesion metrics and entry points
- **Pattern template detection:** Identifies recurring pattern type combinations across code units, selects canonical examples as templates, and tracks followers; exposed in PATTERNS.md manifests and via MCP tool
- **Impact analysis:** BFS transitive dependency computation (`computeTransitiveDeps`) and Tarjan's SCC circular dependency detection (`detectCircularDeps`) in `src/application/graph-analysis/`
- **10 new domain models:** FunctionCall, TypeField, EventFlow, SchemaModel/SchemaModelField, UnitSummary, RepositoryGuardClause, RepositoryFileCluster/RepositoryFileClusterMember, RepositoryPatternTemplate/RepositoryPatternTemplateFollower
- **9 new repository ports/adapters:** IFunctionCallRepository, ITypeFieldRepository, IEventFlowRepository, ISchemaModelRepository, IUnitSummaryRepository, IGuardClauseRepository, IFileClusterRepository, IPatternTemplateRepository, ILlmProvider
- **10 new MCP tools:** trace-call-chain, get-event-flow, get-data-models, get-function-context, get-patterns-by-type, get-unit-summaries, get-function-guards, get-feature-area, find-implementation-pattern, plan-change-impact
- **Enhanced manifests:** MODULES.md includes type fields and feature area clustering, PATTERNS.md includes event flows and convention sections from pattern templates, HOTSPOTS.md includes fan-out analysis, DEPENDENCIES.md includes circular dependency detection, new SCHEMA.md for data models
- **Enriched embeddings:** Embedding text builder includes LLM summaries, callers/callees from call graph, events, and cluster membership with priority ordering for 128-token truncation; vector-search MCP tool supports post-filtering by file_path_prefix, pattern_type, min_complexity, cluster_name
- **Optional BYOK LLM enrichment:** Anthropic, OpenAI, or Gemini for AI-generated function summaries

#### Rationale
**Why heuristic (regex) extractors, not AST:**
- Consistent with existing extraction approach (no new parser dependencies)
- Works across all 6 supported languages
- Good enough for structural relationships (exact resolution is not critical for LLM discovery)

**Why a separate post-processing phase:**
- Deep analysis depends on code units already being extracted and stored
- Can be run independently of the main pipeline
- Does not slow down the core extraction for users who don't need deep analysis

**Why BYOK for LLM enrichment:**
- heury is a local-first tool; no built-in cloud dependency
- Users bring their own API key if they want AI summaries
- Supports multiple providers (Anthropic, OpenAI, Gemini) for flexibility

**Alternatives considered:**
1. **AST-based extraction** - Would provide exact call resolution but requires language-specific parsers, increasing dependencies significantly
2. **Embedding deep structure in existing models** - Would bloat CodeUnit and violate SRP
3. **Always-on LLM enrichment** - Would require a cloud dependency, violating local-first principle

#### Consequences
**Positive:**
- LLMs can understand function relationships, data flow, and schemas without reading source
- get-function-context provides a complete picture of any function in a single tool call
- Schema models make database-heavy codebases navigable
- Event flow tracking makes event-driven architectures transparent

**Negative:**
- 11 new database tables (migrations 002-deep-analysis.sql, 003-enhancements.sql: guard_clauses, file_clusters, file_cluster_members, pattern_templates, pattern_template_followers plus 6 deep analysis tables)
- Deep analysis adds processing time proportional to codebase size
- Call graph resolution is heuristic (name-based, not fully resolved)

**Neutral:**
- Enrichment is entirely optional (BYOK, off by default)
- All new extractors follow the existing heuristic pattern
- Token budget increased from 5K to 10K (configurable via `manifestTokenBudget`); new data fills previously underutilized manifests

---

### ADR-006: Git-Diff-Based Incremental Sync with Post-Commit Hook
**Date:** 2026-02-28
**Status:** Accepted
**Deciders:** Architecture Team

#### Context
Full codebase analysis is expensive for large codebases. On each commit, only a small fraction of files typically change. Re-analyzing the entire codebase after every commit wastes time and resources. The project vision calls for automatic post-commit analysis via git hooks.

#### Decision
Implement incremental analysis as a separate code path using `git diff --name-status`:
- **Git diff parser** (`src/application/incremental/git-diff-parser.ts`): Parses `git diff --name-status` output into structured `ChangedFile` records (added, modified, deleted, renamed)
- **Incremental analyzer** (`src/application/incremental/incremental-analyzer.ts`): Processes only changed files -- deletes stale data, re-extracts added/modified files, handles renames by clearing old path and extracting new path
- **CLI integration**: `--incremental` flag on `heury analyze` and `heury hook install/remove` commands for post-commit automation
- **Structural analysis skipped**: File clusters, pattern templates, and circular dependency detection are only computed during full analysis. Incremental sync handles per-file data (code units, dependencies, env variables, guard clauses) and regenerates manifests.

#### Rationale
**Why git diff rather than file hash comparison:**
- Git diff is authoritative: it knows exactly what changed since the last commit
- No need to maintain a separate hash cache or last-analysis timestamp
- Handles renames natively (R status code) which hash-based approaches would miss
- Simpler implementation with fewer moving parts

**Why skip structural analysis in incremental mode:**
- Clusters, templates, and circular deps depend on the full dependency graph
- Computing them for a subset of files could produce inconsistent results
- Full analysis remains available for periodic consistency checks

**Why post-commit hook instead of file watcher:**
- Commits are natural checkpoints where the codebase is in a consistent state
- No background process to manage
- Works in CI/CD environments
- File watchers can be noisy with intermediate saves

**Alternatives considered:**
1. **File hash caching** - Requires maintaining hash state, doesn't handle renames, more code
2. **File watcher (chokidar)** - Background process, fires on intermediate saves, not commit-aligned
3. **Always full analysis** - Too slow for large codebases on every commit

#### Consequences
**Positive:**
- Fast post-commit updates (only changed files re-processed)
- Manifests stay current after each commit
- Zero configuration with `heury hook install`
- Graceful handling of renames and copies

**Negative:**
- Structural analysis (clusters, templates, circular deps) may become stale between full analyses
- Incremental mode cannot detect transitive impacts (e.g., a type change affecting downstream files)
- Hook management adds CLI surface area

**Neutral:**
- Users should run full analysis periodically to refresh structural data
- Incremental and full analysis share the same storage, so switching between them is seamless

---

### ADR-007: Implementation-Phase MCP Tools and Inline Source Support
**Date:** 2026-03-01
**Status:** Accepted
**Deciders:** Architecture Team

#### Context
Benchmark testing revealed that LLMs using heury MCP tools during implementation still made many follow-up `get_file_content` calls to read source code after discovering code units via search or context tools. This created unnecessary round-trips: the LLM would find a function via `search_codebase`, then separately read the file to see the actual source. Additionally, there was no single tool that bundled all implementation-relevant context (source, dependencies, patterns, test locations) for a file or function.

#### Decision
Add inline source support and implementation-phase tools:

1. **`include_source` parameter** added to 5 existing tools (`search_codebase`, `get_code_units`, `get_function_context`, `trace_call_chain`, `plan_change_impact`). When `true`, the tool returns source code inline alongside structural data, eliminating follow-up file reads.

2. **Source extractor utility** (`src/adapters/mcp/source-extractor.ts`): Shared utility that reads source via `IFileSystem` and extracts relevant line ranges for code units. Used by all tools supporting `include_source`.

3. **3 new implementation-phase tools:**
   - `get_implementation_context`: Single-call bundle returning source, dependencies, patterns, test file locations, and feature area for a file or function. Source included by default.
   - `validate_against_patterns`: Real-time validation of new/modified files against established pattern templates. Uses `IFileAnalyzer` port interface to analyze file content on-the-fly.
   - `get_test_patterns`: Discovers test conventions from similar code units -- imports, setup patterns, naming, test file locations.

4. **Revised MCP server instructions**: Compact workflow guidance only (~130 words). Per-tool reference removed since each tool's own schema description already provides that information. Instructions focus on behavioral nudges: hybrid approach (MCP + traditional tools), planning vs implementation phases, manifest-first orientation, and `include_source` principle.

#### Rationale
**Why inline source rather than always returning source:**
- Source code is large; returning it by default would bloat responses for planning-phase queries
- The `include_source` opt-in pattern lets LLMs control the tradeoff between response size and round-trips
- `get_implementation_context` defaults to including source since it is explicitly an implementation tool

**Why an `IFileAnalyzer` port for `validate_against_patterns`:**
- The validation tool needs to analyze file content that may not yet be in the database (new/modified files)
- The `IFileAnalyzer` interface (replacing the original bare callback) follows DIP consistently with all other port interfaces -- the MCP tool does not depend on the analysis pipeline directly
- Enables real-time validation during implementation without requiring a full re-analysis

**Alternatives considered:**
1. **Always include source in all responses** - Too much data for planning queries, wastes tokens
2. **Separate source-enrichment tool** - Still requires an extra round-trip
3. **Client-side caching** - Not all MCP clients support caching; server-side bundling is more reliable

#### Consequences
**Positive:**
- Implementation workflows require significantly fewer tool calls (benchmark: ~40% reduction in follow-up reads)
- Single `get_implementation_context` call replaces multiple search+read cycles
- Pattern validation catches deviations early during implementation
- Test pattern discovery helps LLMs write consistent tests

**Negative:**
- `include_source: true` responses are larger; LLMs must use judgment on when to enable it
- `validate_against_patterns` depends on `IFileAnalyzer` port, adding a new dependency to `McpServerDependencies`
- 3 more tools increase the MCP tool surface area (now 22 tools total)

**Neutral:**
- Implementation-phase tools (`get_implementation_context`, `get_test_patterns`) are always registered; optional deep-analysis repos are handled internally
- `validate_against_patterns` requires `patternTemplateRepo` (conditionally registered)

---

### ADR-008: Remove Vector Search and LLM Enrichment, Replace with MCP-Driven Enrichment
**Date:** 2026-03-01
**Status:** Accepted (supersedes parts of ADR-005)
**Deciders:** Architecture Team

#### Context
Two features were providing limited value relative to their complexity:
- **Vector search** used placeholder hash-based embeddings that produced no real semantic similarity. Upgrading to real embeddings (ONNX or API-based) would add native dependencies or require API keys, contradicting the zero-config local-first principle.
- **LLM enrichment** required users to configure separate API keys (Anthropic, OpenAI, or Gemini) to generate function summaries. This was friction-heavy for a tool that is itself consumed via MCP by agents that ARE LLMs.

Since heury is used via MCP by LLM agents, the calling agent can generate and submit summaries directly -- it already has LLM capabilities. This eliminates the need for both the embedding pipeline and the BYOK enrichment pipeline.

#### Decision
1. **Remove vector search entirely**: Delete `IVectorSearchService`, `IEmbeddingProvider`, `InMemoryVectorSearch`, `LocalEmbeddingProvider`, `OpenAIEmbeddingProvider`, `EmbeddingPipeline`, `EmbeddingTextContext`, embedding text builder, and the `vector-search` MCP tool.
2. **Remove LLM enrichment pipeline**: Delete `ILlmProvider`, `AnthropicProvider`, `OpenAIProvider`, `GeminiProvider`, `LlmProviderFactory`, `EnrichmentProcessor`, and the `--enrich` CLI flag.
3. **Remove config sections**: Remove `embedding` and `enrichment` blocks from `HeuryConfig`.
4. **Add MCP-driven enrichment tools**:
   - `get-unenriched-units`: Returns exported code units that lack summaries, so the calling agent can discover what needs enrichment.
   - `set-unit-summaries`: Accepts batch summaries from the calling agent with `providerModel` set to `'mcp-client'`.
5. **Retain `UnitSummary` model and `IUnitSummaryRepository`**: Summaries are still stored and queryable via `get-unit-summaries`. The data model is unchanged except `providerModel` defaults to `'mcp-client'`.

#### Rationale
**Why remove vector search:**
- Hash-based embeddings were a placeholder with no semantic value
- Real embeddings require either native dependencies (ONNX) or API keys (OpenAI), both adding friction
- Full-text `search-codebase` already provides keyword-based code discovery
- LLM agents can reason about search results without vector similarity scores

**Why MCP-driven enrichment instead of BYOK:**
- The MCP client IS an LLM -- it can analyze code and generate summaries directly
- Eliminates API key configuration entirely
- Simpler architecture: two MCP tools replace an entire enrichment pipeline (3 LLM providers, factory, processor)
- The agent controls enrichment timing and quality

**Alternatives considered:**
1. **Keep vector search with real embeddings** -- Adds native deps or API key requirement, contradicts zero-config goal
2. **Keep BYOK enrichment** -- Unnecessary complexity when the MCP client is itself an LLM
3. **Remove enrichment entirely** -- Summaries are valuable; the MCP-driven approach preserves them without the infrastructure

#### Consequences
**Positive:**
- Simpler architecture: ~3,400 lines of code removed (net -2,855 lines)
- Zero API key configuration needed for any feature
- No native dependencies removed (better-sqlite3 remains the only one)
- Config schema simplified (only core fields remain)
- MCP tool count stays manageable (vector-search removed, 2 enrichment tools added)

**Negative:**
- No semantic search capability (keyword search only)
- Enrichment requires the agent to actively call `get-unenriched-units` + `set-unit-summaries`
- No batch enrichment without an MCP client connected

**Neutral:**
- `UnitSummary` model unchanged; existing summaries remain valid
- `get-unit-summaries` MCP tool unchanged
- Future semantic search could be re-added via a simpler approach if needed

---

## Superseded Decisions

<!-- Deprecated or superseded decisions are moved here -->

---

## Decision Status Definitions

- **Proposed:** Under discussion, not yet decided
- **Accepted:** Decision made and being implemented
- **Deprecated:** No longer relevant, but kept for historical context
- **Superseded:** Replaced by a newer decision (link to new ADR)

---

## Changelog

| Date | ADR | Change | Author |
|------|-----|--------|--------|
| 2026-02-26 | ADR-001 | Initial: Hexagonal Architecture | System |
| 2026-02-26 | ADR-002 | Initial: TypeScript adoption | System |
| 2026-02-26 | ADR-003 | Initial: TDD strategy | System |
| 2026-02-26 | ADR-004 | Initial: Local-first storage | System |
| 2026-02-27 | ADR-004 | Updated: Reflect in-memory vector search implementation | System |
| 2026-02-28 | ADR-005 | Initial: Deep Structural Analysis via heuristic extractors | System |
| 2026-02-28 | ADR-005 | Updated: Token budget note (5K -> 10K, configurable) | System |
| 2026-02-28 | ADR-005 | Updated: Guard clause persistence (migration 003), 3 new MCP tools (get-patterns-by-type, get-unit-summaries, get-function-guards) | System |
| 2026-02-28 | ADR-005 | Updated: Import graph clustering (file_clusters/file_cluster_members tables), get-feature-area MCP tool, feature areas in MODULES.md manifests | System |
| 2026-02-28 | ADR-005 | Updated: Pattern template detection (pattern_templates/pattern_template_followers tables), find-implementation-pattern MCP tool, Conventions section in PATTERNS.md | System |
| 2026-02-28 | ADR-005 | Updated: Impact analysis (transitive deps via BFS, circular deps via Tarjan's SCC), plan-change-impact MCP tool, Circular Dependencies section in DEPENDENCIES.md | System |
| 2026-02-28 | ADR-005 | Updated: Enriched embeddings (summaries, callers/callees, events, clusters in embedding text with priority ordering), vector-search post-filters (file_path_prefix, pattern_type, min_complexity, cluster_name) | System |
| 2026-02-28 | ADR-006 | Initial: Git-diff-based incremental sync with post-commit hook | System |
| 2026-03-01 | ADR-007 | Initial: Implementation-phase MCP tools and inline source support | System |
| 2026-03-01 | ADR-007 | Updated: fileAnalyzer callback replaced with IFileAnalyzer port interface; MCP server refactored to auto-registration pattern via ToolRegistry; shared utilities extracted (test-file-discovery, similar-units, test-structure-parser, instructions) | System |
| 2026-03-01 | ADR-007 | Updated: MCP instructions slimmed to workflow guidance only (~130 words, 73% reduction); per-tool reference removed as redundant with tool schema descriptions | System |
| 2026-03-01 | ADR-008 | Initial: Remove vector search and LLM enrichment, replace with MCP-driven enrichment (get-unenriched-units, set-unit-summaries tools) | System |
