/**
 * MCP server instructions for LLM clients.
 * Workflow guidance and behavioral nudges only — per-tool descriptions
 * are already provided by each tool's own definition schema.
 */

export const MCP_SERVER_INSTRUCTIONS = `Heury: pre-analyzed codebase intelligence. Use alongside traditional file tools (Glob/Grep/Read) — MCP for structure, traditional for precision.

PLANNING: Read .heury/MODULES.md, PATTERNS.md, DEPENDENCIES.md, HOTSPOTS.md first (~10K tokens, relevance-ranked). Use get_code_units (is_exported: true) or search_codebase to find contracts — signatures are often enough without reading source. Use traditional Read for deep context beyond signatures.

IMPLEMENTATION: Start with get_implementation_context — single call bundles source, dependencies, patterns, test locations. Pass include_source: true to search_codebase, get_code_units, get_function_context, trace_call_chain, or plan_change_impact to get source inline and avoid follow-up reads. Use get_test_patterns for test conventions and validate_against_patterns to check new code against codebase patterns.`;
