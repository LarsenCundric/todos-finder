import fs from 'fs';
import path from 'path';
import { execSync, spawnSync } from 'child_process';
import chalk from 'chalk';
import prompts from 'prompts';

// Detect editor by: $VISUAL > $EDITOR > running process > fallback
// Checks what's actually open on the system so it Just Works.
const EDITORS = [
  { process: /Cursor/i,                bin: 'cursor',   type: 'vscode' },
  { process: /Code/,                   bin: 'code',     type: 'vscode' },
  { process: /Windsurf/i,              bin: 'windsurf', type: 'vscode' },
  { process: /Zed/i,                   bin: 'zed',      type: 'vscode' },
  { process: /WebStorm|IntelliJ|PyCharm|GoLand|Rider/i, bin: null, type: 'jetbrains' },
  { process: /Sublime Text/i,          bin: 'subl',     type: 'sublime' },
];

function detectRunningEditor() {
  try {
    const ps = process.platform === 'darwin'
      ? execSync('ps -eo comm', { encoding: 'utf-8', timeout: 3000, stdio: ['pipe', 'pipe', 'pipe'] })
      : execSync('ps -eo comm --no-headers', { encoding: 'utf-8', timeout: 3000, stdio: ['pipe', 'pipe', 'pipe'] });

    for (const editor of EDITORS) {
      if (editor.process.test(ps)) return editor;
    }
  } catch {}
  return null;
}

function getEditor() {
  // Explicit env vars always win
  if (process.env.VISUAL) return { bin: process.env.VISUAL, type: 'unknown' };
  if (process.env.EDITOR) return { bin: process.env.EDITOR, type: 'unknown' };

  // Detect from running processes
  const running = detectRunningEditor();
  if (running && running.bin) return running;

  // Fallback
  return { bin: 'code', type: 'vscode' };
}

function openInEditor(filePath, line) {
  const editor = getEditor();
  const bin = editor.bin;
  const type = editor.type;

  try {
    if (type === 'vscode' || bin.includes('code') || bin.includes('cursor') || bin.includes('windsurf') || bin.includes('zed')) {
      spawnSync(bin, ['--goto', `${filePath}:${line}`], { stdio: 'inherit' });
    } else if (type === 'jetbrains' || bin.includes('idea') || bin.includes('webstorm') || bin.includes('pycharm') || bin.includes('goland')) {
      spawnSync(bin, ['--line', String(line), filePath], { stdio: 'inherit' });
    } else if (type === 'sublime' || bin.includes('subl')) {
      spawnSync(bin, [`${filePath}:${line}`], { stdio: 'inherit' });
    } else if (bin.includes('vim') || bin.includes('nvim') || bin.includes('nano') || bin.includes('emacs')) {
      spawnSync(bin, [`+${line}`, filePath], { stdio: 'inherit' });
    } else {
      spawnSync(bin, [filePath], { stdio: 'inherit' });
    }
    return { ok: true, name: bin };
  } catch {
    return { ok: false, name: bin };
  }
}

const DIM = chalk.dim;

export async function cleanMode(dir, todos) {
  if (todos.length === 0) {
    console.log(chalk.green.bold('\n  No TODOs to triage!\n'));
    return;
  }

  console.log();
  console.log(chalk.hex('#7B68EE').bold('  TODO Triage'));
  console.log(DIM(`  ${todos.length} items to review. Decide the fate of each.\n`));

  const counts = { skip: 0, done: 0, wontfix: 0 };

  // Track line offsets per file — when we delete a line, all subsequent
  // TODOs in that file shift up by 1
  const fileOffsets = new Map();

  for (let i = 0; i < todos.length; i++) {
    const todo = todos[i];
    const offset = fileOffsets.get(todo.file) || 0;
    const adjustedLine = todo.line + offset;

    const typeColor = {
      TODO: chalk.yellow, FIXME: chalk.red, HACK: chalk.hex('#FF8C00'),
      XXX: chalk.red.bold, NOTE: chalk.blue,
    }[todo.type] || chalk.white;

    // Re-read the file to show current state (may have been modified)
    const filePath = path.resolve(dir, todo.file);
    let currentLines;
    try {
      currentLines = fs.readFileSync(filePath, 'utf-8').split('\n');
    } catch {
      console.log(DIM(`  Skipping ${todo.file} (unreadable)\n`));
      counts.skip++;
      continue;
    }

    const lineIdx = adjustedLine - 1;
    if (lineIdx < 0 || lineIdx >= currentLines.length) {
      console.log(DIM(`  Skipping ${todo.file}:${todo.line} (line shifted out of range)\n`));
      counts.skip++;
      continue;
    }

    const currentLine = currentLines[lineIdx];
    const ctxBefore = lineIdx > 0 ? currentLines[lineIdx - 1] : null;
    const ctxAfter = lineIdx < currentLines.length - 1 ? currentLines[lineIdx + 1] : null;

    console.log(DIM(`  \u2500\u2500\u2500 ${i + 1}/${todos.length} \u2500\u2500\u2500`));
    console.log(`  ${typeColor.bold(todo.type)} ${chalk.white(todo.text)}`);
    console.log(`  ${DIM(todo.file + ':' + adjustedLine)}  ${DIM('by')} ${chalk.cyan(todo.author || '?')}`);

    if (ctxBefore) console.log(DIM(`    ${adjustedLine - 1} \u2502 ${ctxBefore.trim()}`));
    console.log(chalk.hex('#FFD700')(`  \u25B6 ${adjustedLine} \u2502 ${currentLine.trim()}`));
    if (ctxAfter) console.log(DIM(`    ${adjustedLine + 1} \u2502 ${ctxAfter.trim()}`));
    console.log();

    const response = await prompts({
      type: 'select',
      name: 'action',
      message: 'Triage:',
      choices: [
        { title: 'Skip — leave as is', value: 'skip' },
        { title: 'Open — fix it now in your editor', value: 'open' },
        { title: 'Resolve — remove the comment', value: 'done' },
        { title: "Won't fix — convert to NOTE with reason", value: 'wontfix' },
        { title: 'Stop — exit triage', value: 'stop' },
      ],
    });

    // User pressed Ctrl+C or chose stop
    if (!response.action || response.action === 'stop') break;

    if (response.action === 'skip') {
      counts.skip++;
      continue;
    }

    let action = response.action;

    if (action === 'open') {
      const result = openInEditor(filePath, adjustedLine);
      if (result.ok) {
        console.log(chalk.cyan(`  Opened in ${result.name}. Fix it, then come back.\n`));
      } else {
        console.log(chalk.red(`  Could not open ${result.name}. Set $EDITOR or $VISUAL.\n`));
      }

      // After editor, ask what to mark it as
      const followUp = await prompts({
        type: 'select',
        name: 'action',
        message: 'After editing:',
        choices: [
          { title: 'Done — I fixed it, remove the comment', value: 'done' },
          { title: 'Skip — not done yet, leave it', value: 'skip' },
        ],
      });
      action = followUp.action || 'skip';

      if (action === 'skip') {
        counts.skip++;
        continue;
      }

      // Re-read the file since the user may have edited it
      try {
        currentLines = fs.readFileSync(filePath, 'utf-8').split('\n');
      } catch {
        counts.skip++;
        continue;
      }

      // The user may have added/removed lines — find the TODO again by content
      const originalContent = currentLine.trim();
      const newIdx = currentLines.findIndex(l => l.trim() === originalContent);
      if (newIdx === -1) {
        // User already removed or changed the line in their editor
        console.log(chalk.green(`  \u2714 Comment already resolved in editor\n`));
        // Can't track offset anymore — file was externally modified in unknown ways.
        // Clear it; subsequent TODOs in this file may land on wrong lines, but
        // the bounds check (lineIdx < 0 || >= length) will catch and skip them.
        fileOffsets.delete(todo.file);
        counts.done++;
        continue;
      }

      // Splice the line and recalculate offset for subsequent TODOs.
      // newIdx is the actual position in the current file. The next TODO's
      // original line needs: offset = (actual position in file) - (original line).
      // After splice: actual position shifted by -1 for lines after newIdx.
      currentLines.splice(newIdx, 1);
      // New offset = where this TODO actually was - where scanner thought it was - 1 (for the splice)
      fileOffsets.set(todo.file, (newIdx + 1) - todo.line - 1);
      counts.done++;
      fs.writeFileSync(filePath, currentLines.join('\n'), 'utf-8');
      console.log(chalk.green(`  \u2714 Resolved\n`));
      continue;
    }

    if (action === 'done') {
      // Remove the entire comment line — the work is done
      currentLines.splice(lineIdx, 1);
      fileOffsets.set(todo.file, offset - 1);
      counts.done++;
      fs.writeFileSync(filePath, currentLines.join('\n'), 'utf-8');
      console.log(chalk.green(`  \u2714 Resolved\n`));
    } else if (action === 'wontfix') {
      const reason = await prompts({
        type: 'text',
        name: 'value',
        message: 'Reason (optional):',
      });
      const note = reason.value ? ` [won't fix: ${reason.value}]` : ' [won\'t fix]';
      const replaced = currentLines[lineIdx].replace(
        /\b(TODO|FIXME|HACK|XXX|BUG|OPTIMIZE|CHANGED|REVIEW|TEMP|NOTE)\b(\([^)]*\))?([:\s!]*)/i,
        (match, keyword, meta, delim) => `NOTE:${note} `
      );
      if (replaced === currentLines[lineIdx]) {
        currentLines[lineIdx] = currentLines[lineIdx].trimEnd() + note;
      } else {
        currentLines[lineIdx] = replaced;
      }
      counts.wontfix++;
      fs.writeFileSync(filePath, currentLines.join('\n'), 'utf-8');
      console.log(chalk.green(`  \u2714 Marked as won't fix\n`));
    }
  }

  console.log();
  console.log(chalk.hex('#7B68EE').bold('  Triage summary:'));
  if (counts.done) console.log(chalk.green(`    Resolved:   ${counts.done}`));
  if (counts.wontfix) console.log(chalk.yellow(`    Won't fix:  ${counts.wontfix}`));
  if (counts.skip) console.log(DIM(`    Skipped:    ${counts.skip}`));
  console.log();
}
