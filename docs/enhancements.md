# Technical Debt & Enhancement Log

**Last Updated:** 2026-02-28
**Total Active Issues:** 2
**Resolved This Month:** 4

---

## Active Issues

### Low Severity

#### [LOW-002] LanguageExtractor Interface Could Be Segregated
- **File:** `src/extraction/language-registry.ts`
- **Principle:** ISP
- **Description:** The `LanguageExtractor` interface has 6 methods. Some consumers only need `extractCodeUnits` or only `getPatternRules`. Currently all language extractors implement all methods, so this is not causing concrete problems, but as the interface grows it could become a fat interface.
- **Suggested Fix:** Consider splitting into `CodeUnitExtractor`, `DependencyExtractor`, `PatternProvider`, and `ComplexityProvider` role interfaces if the interface grows further. Monitor for now.
- **Detected:** 2026-02-27, commit 372fed7

---

## Resolved Issues

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
| Total Active | 2 |
| Critical | 0 |
| High | 0 |
| Medium | 0 |
| Low | 2 |
| Resolved This Month | 4 |
