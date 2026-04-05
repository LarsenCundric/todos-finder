import { execSync, spawnSync } from 'child_process';
import chalk from 'chalk';
import prompts from 'prompts';

function exec(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf-8', timeout: 30000, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch {
    return null;
  }
}

function getRepoInfo() {
  const remote = exec('git remote get-url origin');
  if (!remote) return null;

  const match = remote.match(/github\.com[:/]([^/]+)\/([^/.]+)/);
  if (!match) return null;

  return { owner: match[1], repo: match[2] };
}

export async function createGithubIssues(todos) {
  const repo = getRepoInfo();
  if (!repo) {
    console.log(chalk.red('\n  Not a GitHub repository or no remote configured.\n'));
    return;
  }

  // Check gh CLI
  const ghVersion = exec('gh --version');
  if (!ghVersion) {
    console.log(chalk.red('\n  GitHub CLI (gh) not found. Install it: https://cli.github.com\n'));
    return;
  }

  console.log();
  console.log(chalk.hex('#7B68EE').bold(`  Create GitHub Issues \u2014 ${repo.owner}/${repo.repo}`));
  console.log();

  const choices = todos.map((t, i) => ({
    title: `${chalk.dim(`[${t.file}:${t.line}]`)} ${({
      TODO: chalk.yellow, FIXME: chalk.red, HACK: chalk.hex('#FF8C00'),
      XXX: chalk.red.bold, NOTE: chalk.blue,
    }[t.type] || chalk.white).bold(t.type)} ${t.text || '(no description)'}`,
    value: i,
  }));

  const response = await prompts({
    type: 'multiselect',
    name: 'selected',
    message: 'Select TODOs to create as issues:',
    choices,
    hint: '- Space to select. Return to submit',
  });

  const selected = response.selected || [];

  if (selected.length === 0) {
    console.log(chalk.dim('\n  No issues created.\n'));
    return;
  }

  console.log();
  let created = 0;

  for (const idx of selected) {
    const todo = todos[idx];
    const title = `[${todo.type}] ${todo.text || 'No description'}`;
    const body = [
      `## ${todo.type} Comment`,
      '',
      `**File:** \`${todo.file}:${todo.line}\``,
      todo.author ? `**Author:** ${todo.author}` : '',
      todo.date ? `**Date:** ${todo.date.toISOString().split('T')[0]}` : '',
      '',
      '```',
      todo.contextBefore ? `${todo.line - 1} | ${todo.contextBefore}` : '',
      `${todo.line} | ${todo.contextLine}`,
      todo.contextAfter ? `${todo.line + 1} | ${todo.contextAfter}` : '',
      '```',
      '',
      '_Created by [todos-finder](https://github.com/larsencundric/todos-finder)_',
    ].filter(Boolean).join('\n');

    const labels = [];
    if (todo.type === 'BUG' || todo.type === 'FIXME') labels.push('bug');
    if (todo.type === 'HACK' || todo.type === 'TEMP') labels.push('tech-debt');
    if (todo.priority <= 1) labels.push('priority');

    const args = ['issue', 'create', '--repo', `${repo.owner}/${repo.repo}`, '--title', title, '--body', body];
    if (labels.length > 0) {
      args.push('--label', labels.join(','));
    }
    const spawnResult = spawnSync('gh', args, { encoding: 'utf-8', timeout: 30000, stdio: ['pipe', 'pipe', 'pipe'] });
    const result = spawnResult.status === 0 ? spawnResult.stdout.trim() : null;

    if (result) {
      console.log(chalk.green(`  \u2714 Created: ${result}`));
      created++;
    } else {
      console.log(chalk.red(`  \u2718 Failed: ${title}`));
    }
  }

  console.log(chalk.hex('#7B68EE')(`\n  Created ${created} issue${created !== 1 ? 's' : ''}.\n`));
}
