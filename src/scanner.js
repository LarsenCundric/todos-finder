import fs from 'fs';
import path from 'path';
import ignore from 'ignore';

// Language comment patterns
const COMMENT_PATTERNS = [
  // Single-line: // comment
  { regex: /\/\/\s*(.+)$/gm, languages: ['js', 'ts', 'jsx', 'tsx', 'mjs', 'mts', 'cjs', 'cts', 'java', 'go', 'rs', 'c', 'cpp', 'cc', 'h', 'hpp', 'cs', 'swift', 'kt', 'scala', 'dart', 'php'] },
  // Single-line: # comment
  { regex: /#\s*(.+)$/gm, languages: ['py', 'rb', 'sh', 'bash', 'zsh', 'fish', 'yml', 'yaml', 'toml', 'pl', 'pm', 'r', 'jl', 'ex', 'exs', 'cr', 'nim', 'coffee', 'Makefile', 'Dockerfile', 'tf', 'hcl'] },
  // Single-line: -- comment
  { regex: /--\s*(.+)$/gm, languages: ['lua', 'hs', 'sql', 'elm', 'purs'] },
  // Single-line: ; comment
  { regex: /;\s*(.+)$/gm, languages: ['clj', 'cljs', 'el', 'lisp', 'scm', 'rkt', 'asm', 'ini'] },
  // Single-line: % comment
  { regex: /%\s*(.+)$/gm, languages: ['erl', 'tex', 'latex', 'm'] },
  // HTML/XML: <!-- comment -->
  { regex: /<!--\s*(.+?)\s*-->/gm, languages: ['html', 'htm', 'xml', 'svg', 'vue', 'svelte', 'astro', 'mdx'] },
  // Block comments (treated line by line): /* comment */ or /** comment */
  { regex: /\/\*+\s*(.+?)(?:\s*\*\/)?$/gm, languages: ['js', 'ts', 'jsx', 'tsx', 'mjs', 'mts', 'cjs', 'cts', 'java', 'go', 'rs', 'c', 'cpp', 'cc', 'h', 'hpp', 'cs', 'swift', 'kt', 'scala', 'css', 'scss', 'less', 'php'] },
  // Block comment continuation: * comment
  { regex: /^\s*\*\s+(.+)$/gm, languages: ['js', 'ts', 'jsx', 'tsx', 'mjs', 'mts', 'cjs', 'cts', 'java', 'go', 'rs', 'c', 'cpp', 'cc', 'h', 'hpp', 'cs', 'swift', 'kt', 'scala', 'css', 'scss', 'less', 'php'] },
  // Triple-quote docstrings (Python) — simplified
  { regex: /"""\s*(.+?)(?:""")?$/gm, languages: ['py'] },
];

// Strong keywords: always recognized as tags when they appear at comment start
// or are followed by a delimiter (colon, parens, bang)
// Weak keywords (CHANGED, TEMP, REVIEW, BUG, NOTE): only match when used as
// an explicit tag — must be at comment start AND followed by : ( ! or whitespace+text
// that looks intentional, not mid-sentence prose.

// This regex requires the keyword to be at the START of the comment text
// (ignoring leading whitespace/punctuation like "* " or "# ").
// It won't match "not a bug in our code" or "temp directory".
const TODO_REGEX_STRONG = /^(TODO|FIXME|HACK|XXX|OPTIMIZE)\b(\([^)]*\))?[:\s!]*(.*)/i;
// Weak keywords require colon, bang, or parens — plain "Temp user" won't match
const TODO_REGEX_WEAK = /^(NOTE|BUG|CHANGED|REVIEW|TEMP)\b(\([^)]*\))?\s*([:\!])(.*)/i;

// Also match inline tags like `cost=0.0,  # TODO: blah` where the keyword
// appears after code on the same line — the comment extractor already
// isolates the comment text, so "TODO: blah" is at the start of that text.

const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.svg', '.webp', '.avif',
  '.mp3', '.mp4', '.avi', '.mov', '.mkv', '.webm', '.wav', '.flac',
  '.zip', '.tar', '.gz', '.bz2', '.7z', '.rar', '.xz',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.exe', '.dll', '.so', '.dylib', '.bin', '.dat', '.db', '.sqlite',
  '.woff', '.woff2', '.ttf', '.eot', '.otf',
  '.lock', '.map',
]);

const DEFAULT_IGNORE = [
  'node_modules', '.git', 'dist', 'build', 'out', '.next', '.nuxt',
  '.svelte-kit', 'target', '__pycache__', '.pytest_cache', '.mypy_cache',
  'vendor', 'coverage', '.turbo', '.vercel', '.cache', '.parcel-cache',
  '*.min.js', '*.min.css', '*.bundle.js', '*.chunk.js',
  'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lockb',
];

function loadGitignore(dir) {
  const ig = ignore();
  ig.add(DEFAULT_IGNORE);

  const gitignorePath = path.join(dir, '.gitignore');
  if (fs.existsSync(gitignorePath)) {
    const content = fs.readFileSync(gitignorePath, 'utf-8');
    ig.add(content);
  }
  return ig;
}

function getFileExtension(filePath) {
  const basename = path.basename(filePath);
  if (basename === 'Makefile' || basename === 'Dockerfile') return basename;
  return path.extname(filePath).slice(1).toLowerCase();
}

function getPatternsForFile(filePath) {
  const ext = getFileExtension(filePath);
  return COMMENT_PATTERNS.filter(p => p.languages.includes(ext));
}

function isBinary(filePath) {
  return BINARY_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function extractTodos(filePath, content) {
  const lines = content.split('\n');
  const patterns = getPatternsForFile(filePath);
  const todos = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    for (const pattern of patterns) {
      const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
      let match;

      while ((match = regex.exec(line)) !== null) {
        const commentText = match[1].trim();
        // Try strong keywords first (TODO, FIXME, HACK, XXX, OPTIMIZE)
        let todoMatch = commentText.match(TODO_REGEX_STRONG);
        let text;
        if (todoMatch) {
          text = todoMatch[3]?.trim() || '';
        } else {
          // Try weak keywords — require explicit delimiter after keyword
          todoMatch = commentText.match(TODO_REGEX_WEAK);
          if (todoMatch) {
            text = todoMatch[4]?.trim() || '';
          }
        }

        if (todoMatch) {
          const type = todoMatch[1].toUpperCase();
          const meta = todoMatch[2] ? todoMatch[2].slice(1, -1) : null;
          if (!text) text = '';
          const priority = detectPriority(type, meta, commentText);

          const contextBefore = i > 0 ? lines[i - 1] : null;
          const contextAfter = i < lines.length - 1 ? lines[i + 1] : null;

          todos.push({
            type,
            text,
            meta,
            priority,
            file: filePath,
            line: i + 1,
            contextBefore,
            contextLine: line,
            contextAfter,
          });
          break; // one todo per line
        }
      }
    }
  }

  return todos;
}

function detectPriority(type, meta, raw) {
  // P0, P1, P2 etc
  if (meta) {
    const pMatch = meta.match(/^P(\d)$/i);
    if (pMatch) return parseInt(pMatch[1]);
    if (/urgent|critical|asap|important/i.test(meta)) return 0;
    if (/high/i.test(meta)) return 1;
    if (/medium|med/i.test(meta)) return 2;
    if (/low/i.test(meta)) return 3;
  }

  // Exclamation marks
  const bangMatch = raw.match(/(TODO|FIXME|HACK|XXX|BUG)(!+)/i);
  if (bangMatch) {
    const bangs = bangMatch[2].length;
    if (bangs >= 3) return 0;
    if (bangs === 2) return 1;
    if (bangs === 1) return 2;
  }

  // Type-based defaults
  if (type === 'XXX' || type === 'BUG') return 1;
  if (type === 'FIXME' || type === 'HACK') return 2;
  if (type === 'TODO') return 3;
  return 4; // NOTE, OPTIMIZE, etc.
}

export function scanDirectory(dir) {
  const ig = loadGitignore(dir);
  const todos = [];
  const stats = { filesScanned: 0, dirsScanned: 0 };

  function walk(currentDir) {
    let entries;
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    stats.dirsScanned++;

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      const relativePath = path.relative(dir, fullPath);

      if (ig.ignores(relativePath + (entry.isDirectory() ? '/' : ''))) continue;

      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile()) {
        if (isBinary(fullPath)) continue;

        stats.filesScanned++;
        try {
          const content = fs.readFileSync(fullPath, 'utf-8');
          const fileTodos = extractTodos(relativePath, content);
          todos.push(...fileTodos);
        } catch {
          // skip unreadable files
        }
      }
    }
  }

  walk(dir);
  return { todos, stats };
}
