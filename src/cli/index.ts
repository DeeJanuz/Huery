#!/usr/bin/env node

import { Command } from 'commander';
import { initCommand } from './commands/init.js';
import { analyzeCommand } from './commands/analyze.js';
import { serveCommand } from './commands/serve.js';

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
  .option('-d, --dir <directory>', 'Project directory', '.')
  .option('--full', 'Force full re-analysis', false)
  .action((options) => analyzeCommand(options));

program
  .command('serve')
  .description('Start the MCP server')
  .option('-d, --dir <directory>', 'Project directory', '.')
  .option('--transport <type>', 'Transport type (stdio|http)', 'stdio')
  .action((options) => serveCommand(options));

program.parse();
