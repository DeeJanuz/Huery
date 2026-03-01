/**
 * MCP server instructions for LLM clients.
 * Describes available tools, recommended workflows, and usage patterns.
 */

export const MCP_SERVER_INSTRUCTIONS = `Heury: pre-analyzed codebase intelligence for LLM discovery.

Use heury MCP tools alongside traditional file tools (Glob/Grep/Read). MCP provides structural understanding; traditional tools provide precision for deep reading and edge cases. Neither alone is optimal.

## Workflow

PLANNING PHASE (deep understanding needed):
1. ORIENT: Read .heury/MODULES.md, PATTERNS.md, DEPENDENCIES.md, HOTSPOTS.md (~10K tokens). Relevance-ranked — most important items first, omitted items available via MCP.
2. TARGET: search_codebase or get_code_units (is_exported: true) to find functions/classes. Signatures in compact format are often enough to understand contracts.
3. DEEP READ: For planning, use traditional Read on specific files when you need full context beyond signatures. Use get_dependencies and plan_change_impact to understand blast radius.

IMPLEMENTATION PHASE (MCP accelerates this significantly):
1. get_implementation_context: Single call bundles source, dependencies, patterns, test locations, and feature area. Start here — replaces multiple search+read cycles.
2. get_code_units/search_codebase/get_function_context/trace_call_chain with include_source: true: Get source inline to avoid follow-up file reads.
3. get_test_patterns: Discover test conventions and scaffolding for similar code.
4. validate_against_patterns: Check new code against established codebase patterns.

## Tools by phase

Orientation:
- get_analysis_stats: High-level stats (code units, files, languages, patterns)
- get_module_overview: All files with their code units and signatures

Discovery:
- search_codebase: Search by name, file path, or pattern value. Use include_source: true during implementation.
- get_code_units: Filter by file, type, language, complexity, export status. Use is_exported: true for public API discovery. Use include_source: true during implementation.
- vector_search: Semantic similarity search across code units
- get_api_endpoints: API routes with HTTP methods and handler locations
- get_env_variables: Environment variables from .env.example files
- get_patterns_by_type: Code unit patterns by type (DATABASE_READ, API_ENDPOINT, etc.)
- get_data_models: Schema/data models with fields, types, and relations

Deep analysis:
- get_function_context: Complete function context: signature, calls, callers, events, types, summary. Use include_source: true during implementation.
- trace_call_chain: Trace call chains forward (callees) or backward (callers). Use include_source: true during implementation.
- get_dependencies: Import graph filtered by source or target file
- plan_change_impact: Impact of changing a file/function: transitive dependents, circular deps, affected endpoints, risk level. Use include_source: true to get source for target and affected endpoints.
- get_event_flow: Event emissions and subscriptions by name, direction, or framework
- get_unit_summaries: LLM-generated summaries with key behaviors and side effects
- get_function_guards: Guard clauses by unit ID, file path, or guard type
- get_feature_area: Feature area context: metadata, code units, dependencies, patterns, summary
- find_implementation_pattern: Pattern templates by fuzzy query with canonical example and followers

Implementation:
- get_implementation_context: Single-call bundle — source, dependencies, patterns, test locations, feature area. Source included by default.
- validate_against_patterns: Validate new/modified files against pattern templates in real-time.
- get_test_patterns: Test conventions from similar units — imports, setup, naming patterns, test file locations.

Source access:
- get_file_content: Read source files with optional line ranges. Use when you need a file not returned by other tools.

Key principle: During implementation, always pass include_source: true to avoid separate get_file_content calls. get_implementation_context includes source by default.`;
