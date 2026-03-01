# Technical Debt & Enhancement Log

**Last Updated:** 2026-03-01
**Total Active Issues:** 11
**Resolved This Month:** 12

---

## Active Issues

### Medium Severity

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

#### [MED-006] McpServerDependencies Still Growing at 15 Members (SRP -- Partially Resolved)
- **File:** `src/adapters/mcp/server.ts`
- **Principle:** SRP
- **Description:** The procedural `if/push` tool registration and the bare `fileAnalyzer` callback were both resolved in commit e11fdfc (auto-registration pattern + `IFileAnalyzer` port interface). However, `McpServerDependencies` still has 15 members passed through a flat interface. Adding a new tool still requires adding a factory entry to the `toolFactories` array (mild OCP -- though now a single-line addition). The interface could benefit from sub-grouping (core vs deep-analysis vs implementation deps). At 235 lines and with the auto-registration pattern in place, this is now low-medium severity.
- **Suggested Fix:** Extract `McpServerDependencies` into sub-interfaces grouped by tool category (core, deep-analysis, implementation-phase). Each tool factory already receives full deps, so narrowing could be done incrementally.
- **Detected:** 2026-03-01, commit c5ea57c
- **Updated:** 2026-03-01, commit e11fdfc (auto-registration and IFileAnalyzer resolved)

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

#### [LOW-002] LanguageExtractor Interface Could Be Segregated
- **File:** `src/extraction/language-registry.ts`
- **Principle:** ISP
- **Description:** The `LanguageExtractor` interface has 6 methods. Some consumers only need `extractCodeUnits` or only `getPatternRules`. Currently all language extractors implement all methods, so this is not causing concrete problems, but as the interface grows it could become a fat interface.
- **Suggested Fix:** Consider splitting into `CodeUnitExtractor`, `DependencyExtractor`, `PatternProvider`, and `ComplexityProvider` role interfaces if the interface grows further. Monitor for now.
- **Detected:** 2026-02-27, commit 372fed7

---

## Resolved Issues

#### [LOW-007] LLM Provider Factory Uses Switch on Provider Type
- **Resolved:** 2026-03-01, commit ec964d0
- **Resolution:** Entire LLM provider subsystem removed. The factory, all three provider adapters (Anthropic, OpenAI, Gemini), and the `ILlmProvider` port interface were deleted. Enrichment is now handled via MCP tools, eliminating the need for built-in LLM providers.

#### [LOW-004] analyzeCommand Accumulating Post-Analysis Responsibilities (Enrichment Path)
- **Resolved:** 2026-03-01, commit ec964d0
- **Resolution:** The enrichment execution path was removed from `analyzeCommand`. The `runEnrichment` function (which created a second `DatabaseManager` and had concrete `SqliteCodeUnitRepository` imports) was deleted entirely. Enrichment is now handled via MCP tools (`set-unit-summaries`, `get-unenriched-units`). Remaining full/incremental path duplication tracked in MED-004 and LOW-014.

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
| Total Active | 11 |
| Critical | 0 |
| High | 0 |
| Medium | 3 |
| Low | 8 |
| Resolved This Month | 12 |
