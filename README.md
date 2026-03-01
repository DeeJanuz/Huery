# Heury

Local-first codebase analysis for LLM agents. Extracts structure, patterns, and relationships from your code and exposes them as [MCP](https://modelcontextprotocol.io/) tools.

## Why

LLM agents waste context reading files to understand a codebase. Heury pre-analyzes your code and gives agents structured access to modules, dependencies, patterns, call chains, data models, and more — so they can orient quickly and make better decisions.

## What it does

- Extracts code units (functions, classes, interfaces), dependencies, API endpoints, env variables, event flows, data models, guard clauses, and design patterns
- Detects patterns: singleton, factory, observer, middleware, repository, decorator, and more
- Supports JavaScript/TypeScript, Python, Go, Java, Rust, and C#
- Stores everything in a local SQLite database
- Exposes MCP tools for agents to query the analysis
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

## UI viewer

Browse your analysis data in a local web UI:

```sh
heury ui
```

Opens a viewer at `http://localhost:3939` with:

- **Dashboard** — overview statistics and metrics
- **Search** — full-text search across code units with filtering
- **Cluster Map** — force-directed galaxy layout where connected clusters form tight groups and disconnected clusters orbit in a halo. Color-coded connected components with background halos for visual differentiation. Typeahead search to find and zoom to clusters.
- **Code Unit Detail** — full context for a function or class: callers, callees, type fields, events, and extracted source code with line numbers

Use `--host 0.0.0.0` to access from another machine on your network.

## Keeping analysis fresh

Install a git hook to run incremental analysis on every commit:

```sh
heury hook install
```

## Ludflow

Heury is part of the [Ludflow](https://ludflow.com) project. If you're looking for a managed SaaS tool that brings organizational data and data governance into your AI workflows, check out [ludflow.com](https://ludflow.com).

## Contributing

Contributions are welcome! Please read the [Contributing Guide](CONTRIBUTING.md) for details on our development workflow, code standards, and the CLA requirement.

## License

[Elastic License 2.0](LICENSE) — Licensor: Ludflow LLC
