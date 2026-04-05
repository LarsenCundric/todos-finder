#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs';
import path from 'path';
import { scanDirectory } from './scanner.js';
import { isGitRepo, getGitUser, blameTodos, getRecentlyChangedFiles, getTodoTrend } from './git.js';
import { printBanner, printSummaryBar, printTodos, printStats, printFilterInfo, todosToMarkdown } from './display.js';
import { watchMode } from './watch.js';
import { cleanMode } from './clean.js';
import { createGithubIssues } from './github.js';

function sortTodos(todos, sortBy) {
  switch (sortBy) {
    case 'priority':
      return todos.sort((a, b) => a.priority - b.priority || (a.file.localeCompare(b.file)));
    case 'age':
      return todos.sort((a, b) => (b.age || 0) - (a.age || 0));
    case 'file':
      return todos.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
    case 'author':
      return todos.sort((a, b) => (a.author || '').localeCompare(b.author || ''));
    default:
      return todos.sort((a, b) => a.priority - b.priority || (b.age || 0) - (a.age || 0));
  }
}

async function loadTodos(dir) {
  const parentOpts = program.opts();
  const spinner = ora({
    text: chalk.dim('Scanning codebase...'),
    color: 'magenta',
    spinner: 'dots12',
  }).start();

  const result = await scanDirectory(dir);

  const gitEnabled = isGitRepo(dir);
  if (gitEnabled && result.todos.length > 0 && parentOpts.blame !== false) {
    spinner.text = chalk.dim(`Blaming ${result.todos.length} TODOs...`);
    blameTodos(dir, result.todos);
  }

  spinner.stop();
  return { ...result, gitEnabled };
}

const program = new Command();

program
  .name('todos')
  .description('Scan your codebase for TODO/FIXME/HACK/XXX/NOTE comments')
  .version('1.0.0')
  .option('-d, --dir <path>', 'directory to scan', process.cwd())
  .option('-s, --sort <field>', 'sort by: priority, age, file, author', 'priority')
  .option('--no-context', 'hide code context')
  .option('--no-blame', 'skip git blame (faster)')
  .option('-t, --type <types>', 'filter by type (comma-separated)', '')
  .action(async (opts) => {
    const dir = path.resolve(opts.dir);
    printBanner();

    const { todos, stats, gitEnabled } = await loadTodos(dir);

    let filtered = todos;
    if (opts.type) {
      const types = opts.type.toUpperCase().split(',');
      filtered = filtered.filter(t => types.includes(t.type));
      printFilterInfo(`type = ${types.join(', ')}`);
    }

    const sorted = sortTodos(filtered, opts.sort);
    printSummaryBar(sorted, stats);
    printTodos(sorted, { context: opts.context });
  });

program
  .command('mine')
  .description('Show only your TODOs (matches git user.name)')
  .option('-s, --sort <field>', 'sort by: priority, age, file, author', 'priority')
  .action(async (opts) => {
    const dir = path.resolve(program.opts().dir);
    printBanner();

    const { todos, stats } = await loadTodos(dir);
    const user = getGitUser(dir);

    if (user === 'unknown') {
      console.log(chalk.red('\n  Could not determine git user. Set git config user.name.\n'));
      process.exit(1);
    }

    printFilterInfo(`author = ${user}`);

    const mine = todos.filter(t =>
      t.author && t.author.toLowerCase().includes(user.toLowerCase())
    );

    const sorted = sortTodos(mine, opts.sort);
    printSummaryBar(sorted, stats);
    printTodos(sorted, { context: program.opts().context });
  });

program
  .command('stale [threshold]')
  .description('Show TODOs older than a threshold (default: 6 months)')
  .option('-s, --sort <field>', 'sort by: priority, age, file, author', 'age')
  .action(async (threshold, opts) => {
    const dir = path.resolve(program.opts().dir);
    printBanner();

    const { todos, stats } = await loadTodos(dir);

    let ms = 180 * 86400000; // 6 months default
    if (threshold) {
      const match = threshold.match(/^(\d+)(d|w|m|y)$/);
      if (match) {
        const n = parseInt(match[1]);
        const unit = match[2];
        const multipliers = { d: 86400000, w: 7 * 86400000, m: 30 * 86400000, y: 365 * 86400000 };
        ms = n * multipliers[unit];
      } else {
        console.log(chalk.red(`\n  Invalid threshold: "${threshold}". Use format: 30d, 4w, 3m, 1y\n`));
        process.exit(1);
      }
    }

    const label = threshold || '6m';
    printFilterInfo(`age > ${label}`);

    const stale = todos.filter(t => t.age && t.age > ms);
    const sorted = sortTodos(stale, opts.sort);
    printSummaryBar(sorted, stats);

    if (stale.length > 0) {
      console.log(chalk.red.dim('  \uD83D\uDC80 The Shame List\n'));
    }
    printTodos(sorted, { context: program.opts().context });
  });

program
  .command('hot')
  .description('TODOs in recently changed files')
  .option('--days <n>', 'lookback period in days', '14')
  .option('-s, --sort <field>', 'sort by: priority, age, file, author', 'priority')
  .action(async (opts) => {
    const dir = path.resolve(program.opts().dir);
    printBanner();

    const { todos, stats, gitEnabled } = await loadTodos(dir);

    if (!gitEnabled) {
      console.log(chalk.yellow('\n  Not a git repository. The hot command requires git.\n'));
      process.exit(1);
    }

    const recentFiles = getRecentlyChangedFiles(dir, parseInt(opts.days));
    printFilterInfo(`files changed in last ${opts.days} days`);

    const hot = todos.filter(t => recentFiles.has(t.file));
    const sorted = sortTodos(hot, opts.sort);
    printSummaryBar(sorted, stats);
    printTodos(sorted, { context: program.opts().context });
  });

program
  .command('stats')
  .description('Dashboard with counts, charts, and trends')
  .action(async () => {
    const dir = path.resolve(program.opts().dir);
    printBanner();

    const { todos, stats, gitEnabled } = await loadTodos(dir);

    printSummaryBar(todos, stats);

    let trend = [];
    if (gitEnabled) {
      const spinner = ora({ text: chalk.dim('Computing trend...'), color: 'magenta', spinner: 'dots12' }).start();
      trend = getTodoTrend(dir);
      spinner.stop();
    }

    printStats(todos, trend);
  });

program
  .command('export')
  .description('Export TODOs')
  .option('--md', 'export as Markdown')
  .option('--gh', 'create GitHub issues')
  .option('-o, --output <file>', 'output file for --md')
  .action(async (opts) => {
    const dir = path.resolve(program.opts().dir);

    if (opts.gh) {
      printBanner();
      const { todos } = await loadTodos(dir);
      const sorted = sortTodos(todos, 'priority');
      await createGithubIssues(sorted);
      return;
    }

    if (opts.md) {
      const { todos } = await loadTodos(dir);
      const sorted = sortTodos(todos, 'file');
      const md = todosToMarkdown(sorted);

      if (opts.output) {
        fs.writeFileSync(opts.output, md, 'utf-8');
        console.log(chalk.green(`\n  \u2714 Exported to ${opts.output}\n`));
      } else {
        console.log(md);
      }
      return;
    }

    console.log(chalk.yellow('\n  Specify --md or --gh\n'));
  });

program
  .command('watch')
  .description('Watch for new TODOs in real-time')
  .action(async () => {
    const dir = path.resolve(program.opts().dir);
    await watchMode(dir);
  });

program
  .command('clean')
  .description('Triage TODOs interactively')
  .option('-s, --sort <field>', 'sort by: priority, age, file, author', 'priority')
  .option('--mine', 'only your TODOs')
  .option('--stale <threshold>', 'only TODOs older than threshold (e.g. 3m, 30d)')
  .option('-t, --type <types>', 'filter by type (comma-separated)')
  .action(async (opts) => {
    const dir = path.resolve(program.opts().dir);
    printBanner();

    const { todos } = await loadTodos(dir);
    let filtered = todos;

    if (opts.mine) {
      const user = getGitUser(dir);
      filtered = filtered.filter(t =>
        t.author && t.author.toLowerCase().includes(user.toLowerCase())
      );
      printFilterInfo(`author = ${user}`);
    }

    if (opts.stale) {
      const match = opts.stale.match(/^(\d+)(d|w|m|y)$/);
      if (match) {
        const n = parseInt(match[1]);
        const multipliers = { d: 86400000, w: 7 * 86400000, m: 30 * 86400000, y: 365 * 86400000 };
        const ms = n * multipliers[match[2]];
        filtered = filtered.filter(t => t.age && t.age > ms);
        printFilterInfo(`age > ${opts.stale}`);
      }
    }

    if (opts.type) {
      const types = opts.type.toUpperCase().split(',');
      filtered = filtered.filter(t => types.includes(t.type));
      printFilterInfo(`type = ${types.join(', ')}`);
    }

    const sorted = sortTodos(filtered, opts.sort);
    await cleanMode(dir, sorted);
  });

program.parse();
