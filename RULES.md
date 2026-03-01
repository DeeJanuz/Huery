# Heury — Agent Rules

Copy the content below into a rules file for your CLI tool so that your agent knows how to use heury's MCP tools effectively.

**Where to put it:**

- **Claude Code**: `~/.claude/rules/heury.md` (global) or `your-project/.claude/rules/heury.md` (per-project)
- **Cursor**: `your-project/.cursor/rules/heury.mdc`

---

## Rule content

Copy everything below this line into your rules file:

---

# Heury — Codebase Intelligence

You have access to heury MCP tools that provide pre-analyzed codebase intelligence. Use these tools to understand code structure before reading files directly. This saves context and gives you architectural awareness.

## When to use heury tools

- **Starting a task**: Call `get-module-overview` first to understand the project structure before diving into files.
- **Finding code**: Use `search-codebase` or `get-code-units` instead of grepping — they return structured results with metadata.
- **Understanding data flow**: Use `get-event-flow`, `trace-call-chain`, and `get-function-context` to trace how data moves through the system.
- **Planning changes**: Call `plan-change-impact` before modifying code to understand what else might be affected.
- **Writing new code**: Use `get-patterns-by-type` and `find-implementation-pattern` to follow existing conventions.
- **Writing tests**: Use `get-test-patterns` to match the project's testing conventions.

## Available tools

### Orientation
- `get-module-overview` — High-level view of modules, their responsibilities, and relationships. Start here.
- `get-analysis-stats` — Summary of what heury has indexed (file count, code units, patterns, etc).

### Code discovery
- `search-codebase` — Full-text search across all indexed code units.
- `get-code-units` — Get code units (functions, classes, interfaces) filtered by file, type, or name.
- `get-file-content` — Read a file with heury's structural annotations.

### Structural analysis
- `get-dependencies` — Import/export dependency graph for a file or module.
- `get-api-endpoints` — Discovered HTTP/API endpoints with methods, paths, and handlers.
- `get-data-models` — Database schemas, ORM models, and data structures.
- `get-env-variables` — Environment variables referenced in the codebase.

### Behavioral analysis
- `get-event-flow` — Event emitters, listeners, pub/sub patterns, and message flows.
- `trace-call-chain` — Follow function calls through the codebase from a starting point.
- `get-function-context` — Full context for a function: callers, callees, types used, patterns applied.
- `get-function-guards` — Guard clauses, early returns, and validation patterns in functions.

### Pattern analysis
- `get-patterns-by-type` — Design patterns detected in the codebase (singleton, factory, observer, etc).
- `find-implementation-pattern` — Find how a specific pattern is implemented with examples.
- `validate-against-patterns` — Check if proposed code follows established patterns.
- `get-test-patterns` — Testing conventions: frameworks, assertion styles, mocking patterns, file organization.

### Planning
- `plan-change-impact` — Analyze the blast radius of a proposed change: affected files, tests, and dependencies.
- `get-feature-area` — Get all code related to a feature area (groups files, endpoints, models, and patterns).
- `get-implementation-context` — Combined context for implementing a change: relevant code units, patterns, and conventions.

## Workflow

1. **Orient**: `get-module-overview` to understand the lay of the land
2. **Discover**: `search-codebase` or `get-code-units` to find relevant code
3. **Understand**: `get-function-context`, `trace-call-chain` to understand behavior
4. **Plan**: `plan-change-impact` before making changes
5. **Conform**: `get-patterns-by-type`, `get-test-patterns` to match conventions
6. **Implement**: Write code that follows the patterns you discovered

## Notes

- Heury works on pre-analyzed data. If the codebase was recently changed, the analysis may be stale. Run `heury analyze` to refresh.
- The `.heury/` directory contains manifest files (MODULES.md, PATTERNS.md, etc) that can be read directly for a quick overview.
- All tools return structured data — prefer them over raw file reads when you need to understand code relationships.
