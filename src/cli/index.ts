#!/usr/bin/env node

import { Command } from 'commander';
import { initCommand } from './commands/init.js';
import { analyzeCommand } from './commands/analyze.js';
import { serveCommand } from './commands/serve.js';
import { uiCommand } from './commands/ui.js';
import { hookInstallCommand, hookRemoveCommand } from './commands/hook.js';

const program = new Command();

program
  .name('heury')
  .description('Local-first codebase analysis tool for LLM discovery')
  .version('0.1.0');

program
  .command('init')
  .description('Initialize heury in the current directory')
  .option('-d, --dir <directory>', 'Target directory', '.')
  .action((options) => initCommand(options));

program
  .command('analyze')
  .description('Analyze the codebase')
  .argument('[dir]', 'Project directory (default: current directory)')
  .option('-d, --dir <directory>', 'Project directory', '.')
  .option('--full', 'Force full re-analysis', false)
  .option('--incremental', 'Only analyze files changed in the last commit')
  .action((dir: string | undefined, options) => {
    if (dir) options.dir = dir;
    return analyzeCommand(options);
  });

const hook = program
  .command('hook')
  .description('Manage git hooks');

hook
  .command('install')
  .description('Install post-commit hook for incremental analysis')
  .option('-d, --dir <directory>', 'Project root directory', '.')
  .action((options) => hookInstallCommand(options));

hook
  .command('remove')
  .description('Remove post-commit hook')
  .option('-d, --dir <directory>', 'Project root directory', '.')
  .action((options) => hookRemoveCommand(options));

program
  .command('serve')
  .description('Start the MCP server')
  .option('-d, --dir <directory>', 'Project directory', '.')
  .option('--transport <type>', 'Transport type (stdio|http)', 'stdio')
  .action((options) => serveCommand(options));

program
  .command('ui')
  .description('Start the UI viewer')
  .option('-d, --dir <directory>', 'Project directory', '.')
  .option('-p, --port <port>', 'Port number', '3939')
  .option('-H, --host <host>', 'Host to bind to (use 0.0.0.0 for remote access)', 'localhost')
  .action((options) => uiCommand(options));

program.parse();
