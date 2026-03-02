# Installing Heury

Heury is a local-first codebase analysis tool that extracts structure, patterns, and relationships from your code and exposes them via MCP tools for LLM discovery.

## Prerequisites

- Node.js 20 or later
- npm
- git
- A C/C++ toolchain for building `better-sqlite3` (most systems have this already)
  - **macOS**: Xcode Command Line Tools (`xcode-select --install`)
  - **Ubuntu/Debian**: `sudo apt install build-essential python3`
  - **Fedora/RHEL**: `sudo dnf groupinstall "Development Tools"`
  - **Windows**: Install Visual Studio Build Tools or `npm install -g windows-build-tools`

## Steps

1. Clone the repository:

```sh
git clone https://github.com/djgrant/heury.git
cd heury
```

2. Install dependencies:

```sh
npm install
```

3. Build:

```sh
npm run build
```

4. Verify the build worked:

```sh
node dist/cli/index.js --version
```

You should see `0.1.0`.

## Making `heury` available globally

Link the package so the `heury` command is available anywhere:

```sh
npm link
```

After linking, you can run `heury` from any directory.

To unlink later: `npm unlink -g heury`

## Configuring your CLI tool to use heury's MCP server

Add heury as an MCP server in your tool's configuration. The examples below use the absolute path to the built CLI — replace `/path/to/heury` with where you cloned the repo.

### Claude Code (`~/.claude.json` or project `.mcp.json`)

```json
{
  "mcpServers": {
    "heury": {
      "command": "node",
      "args": ["/path/to/heury/dist/cli/index.js", "serve", "--dir", "."]
    }
  }
}
```

### Cursor (`.cursor/mcp.json`)

```json
{
  "mcpServers": {
    "heury": {
      "command": "node",
      "args": ["/path/to/heury/dist/cli/index.js", "serve", "--dir", "."]
    }
  }
}
```

### If you used `npm link`

After linking, you can use `heury` directly instead of the full path:

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

## Adding agent rules

For agents to use heury's MCP tools effectively, they need rules that describe the available tools and when to use them. Copy the rule content from [RULES.md](RULES.md) into your agent's rules file (the location depends on your tool — consult its documentation for where agent rules or system prompts are configured).

Without these rules, agents may not discover or prioritize heury tools over raw file reads.

## Analyzing a project

Before the MCP tools return useful data, you need to run analysis on your project:

```sh
cd /path/to/your/project
heury init
heury analyze
```

This creates a `.heury/` directory (add to `.gitignore`) containing:
- `heury.db` — SQLite database with all extracted code intelligence
- `MODULES.md`, `PATTERNS.md`, `DEPENDENCIES.md`, `HOTSPOTS.md`, `SCHEMA.md` — token-budgeted manifest files

Analysis is pure heuristic extraction — no LLM or API keys required.

### Incremental analysis via git hook

To keep analysis up to date on every commit:

```sh
heury hook install
```

This installs a `post-commit` git hook that runs `heury analyze --incremental`.

Remove it with `heury hook remove`.

## Troubleshooting

**`better-sqlite3` fails to install**: You need a C/C++ compiler. See Prerequisites above.

**`heury analyze` finds no files**: Check that your `heury.config.json` `include`/`exclude` patterns match your source files. The defaults include everything except `node_modules`, `dist`, `build`, `.git`, and `coverage`.

**MCP server doesn't connect**: Verify the path in your MCP config points to the actual `dist/cli/index.js` file. Run `node /path/to/heury/dist/cli/index.js serve --dir .` manually to check for errors.
