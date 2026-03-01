# Technical Debt & Enhancement Log

**Last Updated:** 2026-03-01
**Total Active Issues:** 20
**Resolved This Month:** 13

---

## Active Issues

### Medium Severity

#### [MED-010] ClusterGraph.tsx at 671 Lines with 5+ Responsibilities (SRP)
- **File:** `src/adapters/ui/client/src/components/ClusterGraph.tsx`
- **Principle:** SRP
- **Description:** This single file now contains: (1) force-directed layout computation (`buildLayoutedElements`, ~200 lines), (2) connected component graph analysis (`findConnectedComponents`), (3) color theme management (`getGroupColor`/`GROUP_HUES`), (4) a full typeahead search widget (`ClusterSearch`, ~200 lines with keyboard navigation and ARIA), (5) graph rendering (`ClusterGraph`), and (6) two custom node types (`ClusterNode`, `GroupBackgroundNode`). The `buildLayoutedElements` function is a god-function orchestrating simulation setup, initial positioning, force configuration, halo node generation, and color assignment. The `ClusterSearch` component is fully self-contained and could be extracted to its own file. `findConnectedComponents` is a pure graph algorithm that belongs in a utility.
- **Suggested Fix:** Extract `ClusterSearch` into `ClusterSearch.tsx`. Extract `findConnectedComponents` and layout logic into `cluster-layout.ts`. Extract color theme into `cluster-colors.ts`. This would reduce `ClusterGraph.tsx` to ~150 lines of composition and rendering.
- **Detected:** 2026-03-01, commit f82edf3

#### [MED-009] UI Frontend Has No Test Coverage (Downgraded from HIGH-001)
- **File:** `src/adapters/ui/frontend/**`
- **Principle:** Quality / TDD
- **Description:** Backend route handlers now have 62 tests across 8 test files covering all 7 route factories, the `wrapHandler` utility, the `cluster-detail` module, and shared test helpers (commit 77e5c75). Remaining untested: the frontend `useApi` hook, `parseRoute` function, and React components. These are lower risk than the backend routes but still contain testable logic. Additionally, `findConnectedComponents` and `buildLayoutedElements` in ClusterGraph.tsx are pure functions highly amenable to unit testing, and the `wrapHandler` async error path added in commit f82edf3 lacks test coverage.
- **Suggested Fix:** Add unit tests for `parseRoute` hash parsing and the `useApi` hook state management. Add tests for `findConnectedComponents` and the async error path in `wrapHandler`. React component tests are lower priority.
- **Detected:** 2026-03-01, commit 5ece8c4
- **Updated:** 2026-03-01, commit f82edf3 (ClusterGraph.tsx gained ~500 lines of untested pure logic; wrapHandler async path untested)

#### [MED-008] UI Routes: search.ts and stats.ts Still Use findAll (Scalability -- Partially Resolved)
- **File:** `src/adapters/ui/routes/search.ts`, `src/adapters/ui/routes/stats.ts`
- **Principle:** SRP (repository should own querying)
- **Description:** The `code-units.ts` route now uses targeted repo methods (`findByFilePath`, `findByType`, `findByLanguage`) for primary filters, falling back to `findAll` only when no filters are given (commit 77e5c75). However, `search.ts` still loads all units for substring filtering (acknowledged with a NOTE comment suggesting FTS5), and `stats.ts` still loads all entities to compute counts. These remain scalability concerns for large codebases.
- **Suggested Fix:** For search: add SQLite FTS5 index or `LIKE` query behind a repo method. For stats: add `count()` methods to repository interfaces. Can be done incrementally.
- **Detected:** 2026-03-01, commit 5ece8c4
- **Updated:** 2026-03-01, commit 77e5c75 (code-units.ts now uses targeted queries)

#### [MED-004] analyzeCommand Still Has Duplicated Manifest Generation (SRP -- Partially Resolved)
- **File:** `src/cli/commands/analyze.ts`
- **Principle:** SRP, DRY
- **Description:** The enrichment execution path and its DIP violations (second `DatabaseManager`, concrete `SqliteCodeUnitRepository` imports) were removed in commit ec964d0. The command now has two execution paths (full and incremental) instead of four, which is a significant improvement. However, the duplicated `generateManifests` call block between the full analysis path and `runIncrementalAnalysis` remains (see LOW-014). Downgraded from previous severity since the DIP concerns are resolved.
- **Suggested Fix:** (1) Extract a shared `generateManifestsForContext(dependencies, options, config, fs)` helper to deduplicate the manifest generation call. (2) Consider a strategy pattern for the full/incremental paths if more paths are added.
- **Detected:** 2026-02-28, commit f749d47
- **Updated:** 2026-03-01, commit ec964d0 (enrichment path removed, DIP violations resolved)

#### [MED-005] schema-model-extractor.ts at 507 Lines with Four Framework Parsers (Growing SRP)
- **File:** `src/extraction/schema-model-extractor.ts`
- **Principle:** SRP, OCP
- **Description:** This single file contains detection logic and field parsing for Prisma, TypeORM, Mongoose, and Drizzle -- four distinct ORM frameworks. At 507 lines it is the largest new extractor. Adding a fifth framework (e.g., Sequelize, MikroORM) requires modifying the `extractSchemaModels` orchestrator function and adding another block of code to this file. The pattern `if (hasX) extractX()` is a mild type-switch on framework.
- **Suggested Fix:** Extract each framework parser into its own module (e.g., `prisma-schema-parser.ts`) behind a shared `SchemaParser` interface with a `canHandle(content, filePath): boolean` method. The orchestrator loops over registered parsers, achieving OCP. Not urgent while only 4 frameworks exist, but the file is already large enough to warrant monitoring.
- **Detected:** 2026-02-28, commit f749d47

#### [MED-006] McpServerDependencies Still Growing at 14 Members (SRP -- Partially Resolved)
- **File:** `src/adapters/mcp/server.ts`
- **Principle:** SRP
- **Description:** The procedural `if/push` tool registration and the bare `fileAnalyzer` callback were both resolved in commit e11fdfc (auto-registration pattern + `IFileAnalyzer` port interface). `McpServerDependencies` now has 14 members (down from 15 after `unitSummaryRepo` removal in commit 56dbd1a). Adding a new tool still requires adding a factory entry to the `toolFactories` array (mild OCP -- though now a single-line addition). The interface could benefit from sub-grouping (core vs deep-analysis vs implementation deps).
- **Suggested Fix:** Extract `McpServerDependencies` into sub-interfaces grouped by tool category (core, deep-analysis, implementation-phase). Each tool factory already receives full deps, so narrowing could be done incrementally.
- **Detected:** 2026-03-01, commit c5ea57c
- **Updated:** 2026-03-01, commit 56dbd1a (unitSummaryRepo removed, 15 -> 14 members)

### Low Severity

#### [LOW-014] Duplicated generateManifests Call Block in analyze.ts (Full vs Incremental)
- **File:** `src/cli/commands/analyze.ts`
- **Principle:** DRY (supporting SRP)
- **Description:** The `generateManifests` invocation with its 9-property dependency object and 2-property options object is copy-pasted verbatim between the full analysis path (lines 64-80) and the `runIncrementalAnalysis` helper (lines 127-143). This means any change to the manifest generation call (e.g., adding a new repo dependency) must be applied in two places.
- **Suggested Fix:** Extract a shared helper function like `generateManifestsForContext(dependencies, options, config, fs)` that both paths call. Trivial fix.
- **Detected:** 2026-02-28, commit 2a6205f

#### [LOW-013] hook.ts Uses Concrete NodeFileSystem Fallback (DIP)
- **File:** `src/cli/commands/hook.ts`
- **Principle:** DIP
- **Description:** `hookInstallCommand` and `hookRemoveCommand` each have `new NodeFileSystem()` as a default fallback when no `IFileSystem` is injected. While the injection seam exists for testing, the concrete import couples the CLI command module directly to the Node adapter. The same pattern exists in `analyzeCommand` (pre-existing), so this is consistent but worth noting as the project grows.
- **Suggested Fix:** Wire the file system from the CLI entry point (`index.ts`) or a composition root, removing concrete adapter imports from command files. Low urgency since the injection seam already makes this testable.
- **Detected:** 2026-02-28, commit 2a6205f

#### [LOW-012] incremental-analyzer.ts Contains Duplicate globToRegex / passesGlobFilters Logic
- **File:** `src/application/incremental/incremental-analyzer.ts`
- **Principle:** DRY (supporting SRP)
- **Description:** The `globToRegex` and `passesGlobFilters` functions in `incremental-analyzer.ts` duplicate the glob-matching logic that already exists in `src/application/file-filter.ts` (via `shouldProcessFile`). The incremental analyzer calls `shouldProcessFile` for language-extension checking but then also applies its own separate glob filtering. This dual filtering path means changes to glob behavior need to be synchronized in two places.
- **Suggested Fix:** Consolidate the glob filtering into `file-filter.ts` (e.g., expose a `passesGlobFilters` function there) and have the incremental analyzer use it. The `shouldProcessFile` function could be extended to accept include/exclude patterns, or a separate exported utility could be shared.
- **Detected:** 2026-02-28, commit 2a6205f

#### [LOW-011] Duplicated Graph-Building Logic Between transitive-deps.ts and circular-deps.ts
- **File:** `src/application/graph-analysis/transitive-deps.ts`, `src/application/graph-analysis/circular-deps.ts`
- **Principle:** DRY (supporting SRP)
- **Description:** Both `transitive-deps.ts` (`buildDirectedAdjacency`) and `circular-deps.ts` (`buildDirectedGraph`) contain near-identical logic for building a `Map<string, Set<string>>` adjacency graph from `FileDependency[]`, including the same deduplication-via-seen-set approach and node-existence guarantees. The `transitive-deps` version adds directional reversal for the "dependents" direction, but the core structure (iterate deps, deduplicate by string key, populate Map of Sets) is duplicated.
- **Suggested Fix:** Extract a shared `buildAdjacencyGraph(deps, direction?)` utility into a `src/application/graph-analysis/graph-utils.ts` module. Both consumers would call this shared function. The `direction` parameter (defaulting to `'dependencies'`) handles the edge reversal for the transitive-deps use case. Trivial fix with no behavioral change.
- **Detected:** 2026-02-28, commit 3e8721b

#### [LOW-010] generatePatternsManifest Growing Positional Parameter List (5 Params)
- **File:** `src/application/manifest/patterns-generator.ts`
- **Principle:** SRP (secondary: readability)
- **Description:** `generatePatternsManifest` now accepts 5 positional parameters (`codeUnitRepo`, `envVarRepo`, `maxTokens`, `eventFlowRepo?`, `patternTemplateRepo?`), two of which are optional trailing params. This mirrors the same issue already tracked in LOW-008 for `generateModulesManifest`. Adding another optional repo will make call sites difficult to read. The function signature is fragile because optional positional params must maintain order.
- **Suggested Fix:** Bundle the repository dependencies into a `PatternsGeneratorDeps` interface object, consistent with the fix suggested for LOW-008. This would unify the approach across all manifest generators.
- **Detected:** 2026-02-28, commit 6211e80

#### [LOW-009] deep-analysis-processor.ts processDeepAnalysis Accumulating Extraction Responsibilities
- **File:** `src/application/deep-analysis-processor.ts`
- **Principle:** SRP
- **Description:** `processDeepAnalysis` now orchestrates 7 distinct extraction/computation tasks: function calls, type fields, event flows, schema models, guards, file clusters, and pattern templates. The `DeepAnalysisDependencies` interface has grown to 9 optional/required repos. Each new feature adds another `if (deps.xRepo)` block to the function body. The function is 239 lines and still manageable but is on a trajectory toward becoming a god function. The pattern template block (lines 196-228) follows the same structural pattern as the cluster block, suggesting an extraction opportunity.
- **Suggested Fix:** Consider extracting each post-processing step into a separate function or class behind a common `DeepAnalysisStep` interface with `canRun(deps): boolean` and `run(fileResults, fileContents, deps): StepResult`. The orchestrator iterates over registered steps. Not urgent since the current structure is readable, but monitor as more steps are added.
- **Detected:** 2026-02-28, commit 6211e80

#### [LOW-008] generateModulesManifest Growing Parameter List (5 Positional Params)
- **File:** `src/application/manifest/modules-generator.ts`
- **Principle:** SRP (secondary: readability)
- **Description:** `generateModulesManifest` now accepts 5 positional parameters (`codeUnitRepo`, `dependencyRepo`, `maxTokens`, `typeFieldRepo?`, `fileClusterRepo?`), two of which are optional trailing params. This is not severe but is on the boundary of parameter-object refactoring territory. Adding another optional repo will make call sites difficult to read and the signature fragile (optional positional params must maintain order).
- **Suggested Fix:** Bundle the repository dependencies into a single `ModulesGeneratorDeps` interface object, keeping `maxTokens` as a separate parameter or part of an options object. This matches the pattern already used by `DeepAnalysisDependencies` and `AnalysisDependencies` in the same codebase. Low urgency since only 5 params currently.
- **Detected:** 2026-02-28, commit a1b78ca

#### [LOW-006] Duplicated getLineNumber Utility Across Extractors
- **File:** `src/extraction/event-flow-extractor.ts`, `src/extraction/schema-model-extractor.ts`
- **Principle:** DRY (supporting SRP)
- **Description:** Both `event-flow-extractor.ts` and `schema-model-extractor.ts` contain identical `getLineNumber(content, offset)` functions that compute 1-based line numbers from character offsets. This is a small but clear duplication.
- **Suggested Fix:** Extract into a shared `src/extraction/utils.ts` or similar. Trivial fix.
- **Detected:** 2026-02-28, commit f749d47

#### [LOW-005] function-extractor.ts Name and Scope Mismatch (Growing SRP Concern)
- **File:** `src/extraction/function-extractor.ts`
- **Principle:** SRP
- **Description:** The file is named "function-extractor" but now extracts 7 distinct construct types: named functions, arrow functions, classes, methods, interfaces, enums, and type aliases. At 468 lines, the `extractCodeUnits` orchestrator function must be modified each time a new construct type is added (mild OCP concern). The file is not yet a god module but is on a trajectory toward one.
- **Suggested Fix:** Rename to `ts-code-unit-extractor.ts` (or similar) to match actual scope. If the file grows past ~600 lines, consider extracting each construct extractor into its own module with a registry pattern so new types can be added without modifying `extractCodeUnits`. Monitor for now.
- **Detected:** 2026-02-28, commit dae2249

#### [LOW-018] Stale Enrichment References in Architecture Docs After Feature Removal
- **File:** `docs/architecture-decisions.md`, `docs/rag-implementation-design.md`
- **Principle:** Documentation accuracy
- **Description:** After the enrichment feature was fully removed in commit 56dbd1a, several documentation files still reference the deleted tools and interfaces. `architecture-decisions.md` ADR-008 section (lines ~438-478) describes `get-unenriched-units`, `set-unit-summaries`, and `UnitSummary` as if they exist. ADR-005's summary (line 266) still lists `ILlmProvider` in the ports list. `rag-implementation-design.md` deprecation notice (line 3) references the deleted tools as replacements, and line 136 references `IUnitSummaryRepository`. These are historical docs but the stale references could confuse future readers.
- **Suggested Fix:** Update ADR-008 to note that the MCP enrichment tools were subsequently removed. Remove `ILlmProvider` from ADR-005 line 266. Update the `rag-implementation-design.md` deprecation notice to reflect that enrichment was fully removed, not replaced.
- **Detected:** 2026-03-01, commit 56dbd1a

#### [LOW-020] Global SIGPIPE Banner Affects All Build Outputs (Scope)
- **File:** `tsup.config.ts`
- **Principle:** SRP (build config should not inject runtime behavior for a single command)
- **Description:** The `process.on("SIGPIPE", () => {})` handler is injected via tsup `banner` into every built JS file. Only the UI server command (`ui.ts`) needs this for background process resilience. Applying it globally masks potential SIGPIPE issues in other contexts (e.g., MCP stdio transport where SIGPIPE may be meaningful).
- **Suggested Fix:** Move the SIGPIPE handler into `src/cli/commands/ui.ts` at the top of `uiCommand()`, or create a dedicated entry point for the UI server. Remove the global banner from `tsup.config.ts`.
- **Detected:** 2026-03-01, commit d5867e1

#### [LOW-021] Unexplained keepalive setInterval in uiCommand (Process Lifecycle)
- **File:** `src/cli/commands/ui.ts`
- **Principle:** Code clarity / SRP
- **Description:** `setInterval(() => {}, 1 << 30)` is used to keep the Node.js process alive after starting the Express server. However, `app.listen()` already keeps the event loop active via the HTTP server handle. If this addresses a specific scenario (e.g., detached child process with closed stdio), it should be documented. Otherwise it is dead code that obscures the actual process lifecycle.
- **Suggested Fix:** Investigate whether the process actually exits without this line. If it does (e.g., due to SIGPIPE closing stdio handles), document the reason in a comment. If it does not, remove the line.
- **Detected:** 2026-03-01, commit d5867e1

#### [LOW-022] wrapHandler Async Error Path Has No Test Coverage
- **File:** `src/adapters/ui/route-handler.ts`
- **Principle:** Quality / TDD
- **Description:** The `wrapHandler` utility was extended in commit f82edf3 to support async route handlers via `Promise` detection and `.catch()`. The synchronous error path has test coverage but the new async error path does not. If the async catch logic regresses (e.g., a future refactor drops the `instanceof Promise` check), the error would surface as an unhandled promise rejection rather than a 500 response.
- **Suggested Fix:** Add a test case in `route-handler.test.ts` that passes an async handler which throws, and verify it returns a 500 JSON error response. Trivial addition.
- **Detected:** 2026-03-01, commit f82edf3

#### [LOW-002] LanguageExtractor Interface Could Be Segregated
- **File:** `src/extraction/language-registry.ts`
- **Principle:** ISP
- **Description:** The `LanguageExtractor` interface has 6 methods. Some consumers only need `extractCodeUnits` or only `getPatternRules`. Currently all language extractors implement all methods, so this is not causing concrete problems, but as the interface grows it could become a fat interface.
- **Suggested Fix:** Consider splitting into `CodeUnitExtractor`, `DependencyExtractor`, `PatternProvider`, and `ComplexityProvider` role interfaces if the interface grows further. Monitor for now.
- **Detected:** 2026-02-27, commit 372fed7

---

## Resolved Issues

#### [HIGH-001] UI Feature Has Zero Test Coverage (3300+ Lines Untested)
- **Resolved:** 2026-03-01, commit 77e5c75
- **Resolution:** Added 62 tests across 8 test files covering all 7 backend route factories, `wrapHandler` utility, `cluster-detail` module, and shared test helpers. Remaining frontend coverage (useApi hook, parseRoute, React components) tracked as MED-009.

#### [MED-007] clusters.ts GET /clusters/:id Handler Is a God-Handler (SRP)
- **Resolved:** 2026-03-01, commit 77e5c75
- **Resolution:** Extracted `collectClusterCodeUnits` and `classifyClusterDependencies` into `src/adapters/ui/cluster-detail.ts` with typed interfaces (`ClusterCodeUnit`, `ClassifiedDependencies`). The route handler now only handles HTTP concerns (parse params, call helpers, send response). Extracted module has 223-line dedicated test file.

#### [LOW-019] Duplicated Error Handling Pattern Across 7 UI Route Files (DRY)
- **Resolved:** 2026-03-01, commit 77e5c75
- **Resolution:** Extracted `wrapHandler()` utility into `src/adapters/ui/route-handler.ts`. All 7 route files now wrap handlers with this utility, eliminating 10+ duplicated try/catch blocks. Utility has dedicated test coverage.

#### [LOW-007] LLM Provider Factory Uses Switch on Provider Type
- **Resolved:** 2026-03-01, commit ec964d0
- **Resolution:** Entire LLM provider subsystem removed. The factory, all three provider adapters (Anthropic, OpenAI, Gemini), and the `ILlmProvider` port interface were deleted. Enrichment was subsequently removed entirely (ADR-008) as pre-computed summaries were redundant with raw data exposed via MCP tools.

#### [LOW-004] analyzeCommand Accumulating Post-Analysis Responsibilities (Enrichment Path)
- **Resolved:** 2026-03-01, commit ec964d0
- **Resolution:** The enrichment execution path was removed from `analyzeCommand`. The `runEnrichment` function (which created a second `DatabaseManager` and had concrete `SqliteCodeUnitRepository` imports) was deleted entirely. The MCP enrichment tools (`set-unit-summaries`, `get-unenriched-units`) were subsequently removed in commit 56dbd1a as redundant. Remaining full/incremental path duplication tracked in MED-004 and LOW-014.

#### [LOW-017] Duplicated generateTestFileCandidates Logic Between get-implementation-context.ts and get-test-patterns.ts
- **Resolved:** 2026-03-01, commit e11fdfc
- **Resolution:** Extracted shared `generateTestFileCandidates` into `src/adapters/mcp/test-file-discovery.ts` with `TestFileCandidate` return type. Both tools now import from the shared module.

#### [LOW-016] get-test-patterns.ts at 387 Lines with Multiple Concerns (SRP)
- **Resolved:** 2026-03-01, commit e11fdfc
- **Resolution:** Extracted `findSimilarUnits` into `src/adapters/mcp/similar-units.ts`, `extractTestStructure`/`summarizeSetupBody`/`determineConventions` into `src/adapters/mcp/test-structure-parser.ts`. File reduced from 387 to 157 lines.

#### [LOW-015] get-implementation-context.ts at 300 Lines Composing 6 Data Sources (SRP)
- **Resolved:** 2026-03-01, commit e11fdfc
- **Resolution:** Extracted `generateTestFileCandidates` into shared module, reducing file from 300 to 268 lines. Each data-gathering step remains well-factored into its own function. Monitoring threshold no longer in concern range.

#### [LOW-003] Duplicated Traversal Logic Between findBlockEnd and findBlockEndIndex
- **Resolved:** 2026-02-28
- **Resolution:** Extracted shared `findClosingBrace()` helper that returns both `charIndex` and `lineNumber`; `findBlockEnd` and `findBlockEndIndex` are now thin wrappers.

#### [MED-001] AnalysisOrchestrator: Duplication Between analyze() and analyzeIncremental()
- **Resolved:** 2026-02-27, commit 3153f0a
- **Resolution:** Extracted shared `processFiles()` method; both `analyze()` and `analyzeIncremental()` delegate to it.

#### [MED-002] FileProcessor: Double Code Unit Creation Pattern
- **Resolved:** 2026-02-27, commit 3153f0a
- **Resolution:** Code unit IDs are generated upfront in FileProcessor, eliminating the double-creation pattern and deduplicating `buildCodeUnit` logic.

#### [MED-003] Composition Root Contains In-Memory Repository Implementations
- **Resolved:** 2026-02-27, commit 3153f0a
- **Resolution:** Replaced inline in-memory repositories with SQLite repositories from the storage adapter layer.

#### [LOW-001] SqliteCodeUnitRepository: Children Not Persisted
- **Resolved:** 2026-02-27, commit 3153f0a
- **Resolution:** Children are now persisted and reconstructed using `parent_unit_id`, with top-level filtering on list queries.

---

## Statistics

| Metric | Value |
|--------|-------|
| Total Active | 20 |
| Critical | 0 |
| High | 0 |
| Medium | 6 |
| Low | 14 |
| Resolved This Month | 13 |
