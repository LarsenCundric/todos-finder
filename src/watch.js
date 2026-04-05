import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { scanDirectory } from './scanner.js';
import { blameTodos, isGitRepo } from './git.js';
import { printTodos, printBanner } from './display.js';

export async function watchMode(dir) {
  printBanner();
  console.log(chalk.hex('#7B68EE')('  \uD83D\uDC41  Watch mode active. Waiting for changes...\n'));

  const gitEnabled = isGitRepo(dir);
  let knownTodos = new Map();

  // Initial scan
  const initial = await scanDirectory(dir);
  if (gitEnabled) blameTodos(dir, initial.todos);
  for (const t of initial.todos) {
    knownTodos.set(`${t.file}:${t.line}:${t.type}`, t);
  }
  console.log(chalk.dim(`  Tracking ${knownTodos.size} existing TODOs. Watching for new ones...\n`));

  const debounceTimers = new Map();

  fs.watch(dir, { recursive: true }, (eventType, filename) => {
    if (!filename) return;
    // Skip ignored directories
    if (/(node_modules|\.git|dist|build|\.next)/.test(filename)) return;

    // Debounce per file
    if (debounceTimers.has(filename)) clearTimeout(debounceTimers.get(filename));

    debounceTimers.set(filename, setTimeout(async () => {
      debounceTimers.delete(filename);

      const fullPath = path.join(dir, filename);
      if (!fs.existsSync(fullPath)) return;

      try {
        const stat = fs.statSync(fullPath);
        if (!stat.isFile()) return;

        const result = await scanDirectory(dir);
        const newTodoMap = new Map();
        for (const t of result.todos) {
          newTodoMap.set(`${t.file}:${t.line}:${t.type}`, t);
        }

        // Find new TODOs
        const newOnes = [];
        for (const [key, todo] of newTodoMap) {
          if (!knownTodos.has(key)) {
            newOnes.push(todo);
          }
        }

        // Find removed TODOs
        const removed = [];
        for (const [key, todo] of knownTodos) {
          if (!newTodoMap.has(key)) {
            removed.push(todo);
          }
        }

        if (newOnes.length > 0) {
          if (gitEnabled) blameTodos(dir, newOnes);
          console.log(chalk.green.bold(`\n  + ${newOnes.length} new TODO${newOnes.length > 1 ? 's' : ''} detected:`));
          printTodos(newOnes, { context: true });
        }

        if (removed.length > 0) {
          console.log(chalk.red(`  - ${removed.length} TODO${removed.length > 1 ? 's' : ''} resolved \u2714`));
        }

        knownTodos = newTodoMap;
      } catch {
        // ignore errors during watch
      }
    }, 500));
  });

  // Keep alive
  process.on('SIGINT', () => {
    console.log(chalk.dim('\n  Watch mode stopped.\n'));
    process.exit(0);
  });

  await new Promise(() => {}); // Block forever
}
