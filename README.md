# Heury

Local-first codebase analysis for LLM agents. Extracts structure, patterns, and relationships from your code and exposes them as [MCP](https://modelcontextprotocol.io/) tools.

## Why

LLM agents waste context reading files to understand a codebase. Heury pre-analyzes your code and gives agents structured access to modules, dependencies, patterns, call chains, data models, and more — so they can orient quickly and make better decisions.

## What it does

- Extracts code units (functions, classes, interfaces), dependencies, API endpoints, env variables, event flows, data models, guard clauses, and design patterns
- Detects patterns: singleton, factory, observer, middleware, repository, decorator, and more
- Supports JavaScript/TypeScript, Python, Go, Java, Rust, and C#
- Stores everything in a local SQLite database
- Exposes 20+ MCP tools for agents to query the analysis
- Generates token-budgeted manifest files for quick orientation

## Quick start

```sh
git clone https://github.com/djgrant/heury.git
cd heury
npm install && npm run build
npm link
```

Then in your project:

```sh
cd /path/to/your/project
heury init
heury analyze
```

Add heury as an MCP server (Claude Code example — `~/.claude.json` or project `.mcp.json`):

```json
{
  "mcpServers": {
    "heury": {
      "command": "heury",
      "args": ["serve", "--dir", "."]
    }
  }
}
```

See [INSTALL.md](INSTALL.md) for detailed setup instructions including Cursor configuration.

## Agent rules

Copy the rules from [RULES.md](RULES.md) into your agent's rules file so it knows how to use heury's tools effectively.

## MCP tools

| Category | Tools |
|----------|-------|
| Orientation | `get-module-overview`, `get-analysis-stats` |
| Code discovery | `search-codebase`, `get-code-units`, `get-file-content` |
| Structure | `get-dependencies`, `get-api-endpoints`, `get-data-models`, `get-env-variables` |
| Behavior | `get-event-flow`, `trace-call-chain`, `get-function-context`, `get-function-guards` |
| Patterns | `get-patterns-by-type`, `find-implementation-pattern`, `validate-against-patterns`, `get-test-patterns` |
| Planning | `plan-change-impact`, `get-feature-area`, `get-implementation-context` |
| Enrichment | `get-unit-summaries`, `get-unenriched-units`, `set-unit-summaries` |

## Keeping analysis fresh

Install a git hook to run incremental analysis on every commit:

```sh
heury hook install
```

## License

[Elastic License 2.0](LICENSE)
