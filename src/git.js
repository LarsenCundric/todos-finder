import { execSync, spawnSync } from 'child_process';
import path from 'path';

function exec(cmd, cwd) {
  try {
    return execSync(cmd, { cwd, encoding: 'utf-8', timeout: 30000, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch {
    return null;
  }
}

export function isGitRepo(dir) {
  return exec('git rev-parse --is-inside-work-tree', dir) === 'true';
}

export function getGitUser(dir) {
  return exec('git config user.name', dir) || 'unknown';
}

export function blameLines(dir, filePath, lineNumbers) {
  const results = new Map();
  const absFile = path.resolve(dir, filePath);

  for (const lineNum of lineNumbers) {
    const result = spawnSync('git', ['blame', '-L', `${lineNum},${lineNum}`, '--porcelain', absFile], { cwd: dir, encoding: 'utf-8', timeout: 30000, stdio: ['pipe', 'pipe', 'pipe'] });
    const output = result.status === 0 ? (result.stdout || '').trim() : null;
    if (!output) {
      results.set(lineNum, { author: 'unknown', date: null, age: null });
      continue;
    }

    const authorMatch = output.match(/^author (.+)$/m);
    const timeMatch = output.match(/^author-time (\d+)$/m);

    const author = authorMatch ? authorMatch[1] : 'unknown';
    const timestamp = timeMatch ? parseInt(timeMatch[1]) * 1000 : null;
    const date = timestamp ? new Date(timestamp) : null;
    const age = date ? Date.now() - date.getTime() : null;

    results.set(lineNum, { author, date, age });
  }

  return results;
}

export function blameTodos(dir, todos) {
  // Group by file for efficiency
  const byFile = new Map();
  for (const todo of todos) {
    if (!byFile.has(todo.file)) byFile.set(todo.file, []);
    byFile.get(todo.file).push(todo);
  }

  for (const [file, fileTodos] of byFile) {
    const lineNumbers = fileTodos.map(t => t.line);
    const blameData = blameLines(dir, file, lineNumbers);

    for (const todo of fileTodos) {
      const blame = blameData.get(todo.line);
      if (blame) {
        todo.author = blame.author;
        todo.date = blame.date;
        todo.age = blame.age;
      }
    }
  }

  return todos;
}

export function getRecentlyChangedFiles(dir, days = 14) {
  const since = new Date(Date.now() - days * 86400000).toISOString().split('T')[0];
  const output = exec(`git log --since="${since}" --name-only --pretty=format:""`, dir);
  if (!output) return new Set();

  const files = new Set();
  for (const line of output.split('\n')) {
    const trimmed = line.trim();
    if (trimmed) files.add(trimmed);
  }
  return files;
}

export function getTodoTrend(dir, sampleCount = 6) {
  const points = [];
  const output = exec(`git log --oneline -n 200 --pretty=format:"%H %ai"`, dir);
  if (!output) return points;

  const commits = output.split('\n').map(line => {
    const [hash, ...dateParts] = line.split(' ');
    return { hash, date: dateParts.join(' ') };
  });

  if (commits.length === 0) return points;

  const step = Math.max(1, Math.floor(commits.length / sampleCount));
  const samples = [];
  for (let i = 0; i < commits.length && samples.length < sampleCount; i += step) {
    samples.push(commits[i]);
  }

  for (const sample of samples) {
    const result = spawnSync('git', [
      'grep', '-c', '-E', '\\b(TODO|FIXME|HACK|XXX|NOTE|BUG|OPTIMIZE)\\b',
      sample.hash, '--',
      '*.js', '*.ts', '*.py', '*.go', '*.rs', '*.java', '*.rb',
      '*.c', '*.cpp', '*.h', '*.php', '*.swift', '*.kt', '*.sh',
      '*.lua', '*.sql', '*.css', '*.scss', '*.vue', '*.svelte',
    ], { cwd: dir, encoding: 'utf-8', timeout: 30000, stdio: ['pipe', 'pipe', 'pipe'] });

    // git grep -c outputs "file:count" per line — sum them up
    let total = 0;
    if (result.stdout) {
      for (const line of result.stdout.split('\n')) {
        const match = line.match(/:(\d+)$/);
        if (match) total += parseInt(match[1]);
      }
    }

    points.push({
      date: sample.date.split(' ')[0],
      count: total,
    });
  }

  return points.reverse();
}
