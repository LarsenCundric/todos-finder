import chalk from 'chalk';
import Table from 'cli-table3';
import stringWidth from 'string-width';

const TYPE_COLORS = {
  TODO: chalk.yellow,
  FIXME: chalk.red,
  HACK: chalk.hex('#FF8C00'),
  XXX: chalk.red.bold,
  NOTE: chalk.blue,
  BUG: chalk.red.bold,
  OPTIMIZE: chalk.cyan,
  CHANGED: chalk.magenta,
  REVIEW: chalk.green,
  TEMP: chalk.hex('#FF8C00'),
};

const PRIORITY_LABELS = {
  0: chalk.red.bold('P0'),
  1: chalk.hex('#FF4500').bold('P1'),
  2: chalk.yellow('P2'),
  3: chalk.dim('P3'),
  4: chalk.dim('--'),
};

const HEADER = chalk.hex('#7B68EE').bold;
const DIM = chalk.dim;
const BRIGHT = chalk.white.bold;

function formatAge(ms) {
  if (!ms) return DIM('unknown');
  const days = Math.floor(ms / 86400000);
  if (days === 0) return chalk.green.bold('today');
  if (days === 1) return chalk.green('1 day');
  if (days < 7) return chalk.green(`${days} days`);
  if (days < 30) return chalk.yellow(`${Math.floor(days / 7)}w`);
  if (days < 365) return chalk.hex('#FF8C00')(`${Math.floor(days / 30)}mo`);
  const years = Math.floor(days / 365);
  return chalk.red.bold(`${years}y ${Math.floor((days % 365) / 30)}mo`);
}

function formatAuthor(name) {
  if (!name || name === 'unknown' || name === 'Not Committed Yet') {
    return DIM('uncommitted');
  }
  // Truncate long names
  if (name.length > 18) return chalk.cyan(name.slice(0, 16) + '..');
  return chalk.cyan(name);
}

function truncate(str, max) {
  if (!str) return '';
  if (stringWidth(str) <= max) return str;
  // Trim character by character until we fit
  let result = str;
  while (stringWidth(result) > max - 1 && result.length > 0) {
    result = result.slice(0, -1);
  }
  return result + '\u2026';
}

function formatFilePath(file, line) {
  const dir = DIM(file.replace(/[^/]+$/, ''));
  const name = chalk.white(file.replace(/^.*\//, ''));
  return `${dir}${name}${DIM(`:${line}`)}`;
}

const BOX_INNER_WIDTH = 37;

function padToWidth(text, targetWidth) {
  const actual = stringWidth(text);
  return text + ' '.repeat(Math.max(0, targetWidth - actual));
}

export function printBanner() {
  const line1 = `  \u2714 todos`;
  const line2 = '  codebase comment scanner';
  const border = '\u2500'.repeat(BOX_INNER_WIDTH);
  const color = chalk.hex('#7B68EE').bold;

  console.log();
  console.log(color(`  \u250C${border}\u2510`));
  console.log(
    color('  \u2502') +
    chalk.hex('#E0E0FF').bold(padToWidth(line1, BOX_INNER_WIDTH)) +
    color('\u2502')
  );
  console.log(
    color('  \u2502') +
    DIM(padToWidth(line2, BOX_INNER_WIDTH)) +
    color('\u2502')
  );
  console.log(color(`  \u2514${border}\u2518`));
}

export function printSummaryBar(todos, stats) {
  const types = {};
  for (const t of todos) {
    types[t.type] = (types[t.type] || 0) + 1;
  }

  const parts = Object.entries(types)
    .sort((a, b) => b[1] - a[1])
    .map(([type, count]) => {
      const colorFn = TYPE_COLORS[type] || chalk.white;
      return `${colorFn(type)} ${chalk.white.bold(count)}`;
    });

  console.log();
  console.log(
    `  ${DIM('\u250C')} Found ${BRIGHT(todos.length)} comments in ${DIM(stats.filesScanned + ' files')} ${DIM('\u2502')} ${parts.join(DIM(' \u00B7 '))}`
  );
  console.log();
}

export function printTodos(todos, options = {}) {
  if (todos.length === 0) {
    console.log();
    console.log(chalk.green.bold('  \u2728 No TODOs found! Your codebase is squeaky clean.'));
    console.log();
    return;
  }

  const showContext = options.context !== false;
  const termWidth = process.stdout.columns || 120;
  const textWidth = Math.max(30, Math.min(60, termWidth - 80));

  const table = new Table({
    chars: {
      'top': DIM('\u2500'), 'top-mid': DIM('\u252C'), 'top-left': DIM('\u250C'), 'top-right': DIM('\u2510'),
      'bottom': DIM('\u2500'), 'bottom-mid': DIM('\u2534'), 'bottom-left': DIM('\u2514'), 'bottom-right': DIM('\u2518'),
      'left': DIM('\u2502'), 'left-mid': DIM('\u251C'), 'mid': DIM('\u2500'), 'mid-mid': DIM('\u253C'),
      'right': DIM('\u2502'), 'right-mid': DIM('\u2524'), 'middle': DIM('\u2502'),
    },
    head: [
      HEADER(' '),
      HEADER('Type'),
      HEADER('Comment'),
      HEADER('File'),
      HEADER('Author'),
      HEADER('Age'),
    ],
    colWidths: [6, 10, textWidth, null, 20, 10],
    wordWrap: true,
    wrapOnWordBoundary: true,
    style: { head: [], border: [] },
  });

  for (const todo of todos) {
    const colorFn = TYPE_COLORS[todo.type] || chalk.white;
    const priorityLabel = PRIORITY_LABELS[todo.priority] ?? PRIORITY_LABELS[4];

    let comment = todo.text || DIM('(no description)');
    if (todo.meta && !/^P\d$/i.test(todo.meta)) {
      comment = DIM(`(${todo.meta}) `) + comment;
    }

    table.push([
      priorityLabel,
      colorFn.bold(todo.type),
      chalk.white(truncate(comment, textWidth - 2)),
      formatFilePath(todo.file, todo.line),
      formatAuthor(todo.author),
      formatAge(todo.age),
    ]);

    if (showContext && (todo.contextBefore || todo.contextAfter)) {
      const ctx = [];
      if (todo.contextBefore) ctx.push(DIM(`  ${todo.line - 1} \u2502 ${truncate(todo.contextBefore.trim(), textWidth + 20)}`));
      ctx.push(chalk.hex('#FFD700')(`\u25B6 ${todo.line} \u2502 ${truncate(todo.contextLine.trim(), textWidth + 20)}`));
      if (todo.contextAfter) ctx.push(DIM(`  ${todo.line + 1} \u2502 ${truncate(todo.contextAfter.trim(), textWidth + 20)}`));

      table.push([{ colSpan: 6, content: DIM('  ') + ctx.join('\n' + DIM('  ')), hAlign: 'left' }]);
    }
  }

  console.log(table.toString());
}

export function printStats(todos, trend) {
  console.log();
  console.log(HEADER('  \u2550\u2550\u2550 Dashboard \u2550\u2550\u2550'));
  console.log();

  // Total
  console.log(`  ${BRIGHT('Total:')} ${chalk.hex('#FFD700').bold(todos.length)} comments`);
  console.log();

  // By type
  console.log(`  ${HEADER('By Type')}`);
  const types = {};
  for (const t of todos) types[t.type] = (types[t.type] || 0) + 1;
  const maxTypeCount = Math.max(...Object.values(types));

  for (const [type, count] of Object.entries(types).sort((a, b) => b[1] - a[1])) {
    const colorFn = TYPE_COLORS[type] || chalk.white;
    const barLen = Math.max(1, Math.round((count / maxTypeCount) * 30));
    const bar = colorFn('\u2588'.repeat(barLen) + '\u2591'.repeat(30 - barLen));
    console.log(`  ${colorFn(type.padEnd(10))} ${bar} ${BRIGHT(count)}`);
  }
  console.log();

  // By author
  console.log(`  ${HEADER('By Author')}`);
  const authors = {};
  for (const t of todos) {
    const a = t.author || 'unknown';
    authors[a] = (authors[a] || 0) + 1;
  }
  const maxAuthorCount = Math.max(...Object.values(authors));
  const sortedAuthors = Object.entries(authors).sort((a, b) => b[1] - a[1]).slice(0, 10);

  for (const [author, count] of sortedAuthors) {
    const barLen = Math.max(1, Math.round((count / maxAuthorCount) * 30));
    const bar = chalk.cyan('\u2588'.repeat(barLen) + '\u2591'.repeat(30 - barLen));
    const name = author.length > 18 ? author.slice(0, 16) + '..' : author;
    console.log(`  ${chalk.cyan(name.padEnd(20))} ${bar} ${BRIGHT(count)}`);
  }
  console.log();

  // By age
  console.log(`  ${HEADER('By Age')}`);
  const ageBuckets = { 'This week': 0, 'This month': 0, '1-3 months': 0, '3-6 months': 0, '6-12 months': 0, '1+ years': 0, 'Unknown': 0 };
  for (const t of todos) {
    if (!t.age) { ageBuckets['Unknown']++; continue; }
    const days = t.age / 86400000;
    if (days < 7) ageBuckets['This week']++;
    else if (days < 30) ageBuckets['This month']++;
    else if (days < 90) ageBuckets['1-3 months']++;
    else if (days < 180) ageBuckets['3-6 months']++;
    else if (days < 365) ageBuckets['6-12 months']++;
    else ageBuckets['1+ years']++;
  }

  const maxAgeCount = Math.max(...Object.values(ageBuckets).filter(v => v > 0), 1);
  const ageColors = [chalk.green, chalk.green, chalk.yellow, chalk.hex('#FF8C00'), chalk.red, chalk.red.bold, chalk.dim];
  let i = 0;
  for (const [label, count] of Object.entries(ageBuckets)) {
    if (count === 0) { i++; continue; }
    const colorFn = ageColors[i] || chalk.white;
    const barLen = Math.max(1, Math.round((count / maxAgeCount) * 30));
    const bar = colorFn('\u2588'.repeat(barLen) + '\u2591'.repeat(30 - barLen));
    console.log(`  ${colorFn(label.padEnd(14))} ${bar} ${BRIGHT(count)}`);
    i++;
  }
  console.log();

  // By priority
  console.log(`  ${HEADER('By Priority')}`);
  const priorities = {};
  for (const t of todos) {
    const p = t.priority <= 3 ? `P${t.priority}` : 'None';
    priorities[p] = (priorities[p] || 0) + 1;
  }
  const priColors = { P0: chalk.red.bold, P1: chalk.hex('#FF4500'), P2: chalk.yellow, P3: chalk.dim, None: chalk.dim };
  const maxPriCount = Math.max(...Object.values(priorities), 1);
  for (const [label, count] of Object.entries(priorities).sort()) {
    const colorFn = priColors[label] || chalk.white;
    const barLen = Math.max(1, Math.round((count / maxPriCount) * 30));
    const bar = colorFn('\u2588'.repeat(barLen) + '\u2591'.repeat(30 - barLen));
    console.log(`  ${colorFn(label.padEnd(8))} ${bar} ${BRIGHT(count)}`);
  }
  console.log();

  // Trend
  if (trend && trend.length > 1) {
    console.log(`  ${HEADER('Trend')}`);
    const maxTrend = Math.max(...trend.map(p => p.count), 1);
    for (const point of trend) {
      const barLen = Math.max(1, Math.round((point.count / maxTrend) * 30));
      const bar = chalk.hex('#7B68EE')('\u2588'.repeat(barLen) + '\u2591'.repeat(30 - barLen));
      console.log(`  ${DIM(point.date)}  ${bar} ${BRIGHT(point.count)}`);
    }
    console.log();
  }
}

export function printFilterInfo(label) {
  console.log(`  ${DIM('\u25B8')} Filter: ${chalk.hex('#FFD700')(label)}`);
}

export function todosToMarkdown(todos) {
  let md = '# TODOs\n\n';
  md += `> Generated on ${new Date().toISOString().split('T')[0]}\n\n`;
  md += `| Type | Comment | File | Line | Author | Age |\n`;
  md += `|------|---------|------|------|--------|-----|\n`;

  for (const todo of todos) {
    const age = todo.age ? `${Math.floor(todo.age / 86400000)}d` : '?';
    const text = (todo.text || '').replace(/\|/g, '\\|');
    const meta = todo.meta ? `(${todo.meta.replace(/\|/g, '\\|')}) ` : '';
    md += `| ${todo.type} | ${meta}${text} | ${todo.file} | ${todo.line} | ${todo.author || '?'} | ${age} |\n`;
  }

  return md;
}
