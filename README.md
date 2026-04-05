# todos

**Scan any codebase for TODO/FIXME/HACK/XXX/NOTE comments and display them beautifully.**

Find every forgotten TODO in your codebase — who wrote it, how old it is, and whether anyone still cares. Git blame integration, priority detection, and an interactive triage mode to force decisions on stale comments.

## Install

```bash
npm install -g todos-finder
```

Or run it directly:

```bash
npx todos-finder
```

## Usage

### Scan current project

```bash
todos
```

Shows all TODOs in a color-coded table with comment text, file path, line number, author (via git blame), age, and priority.

### Filter to your TODOs

```bash
todos mine
```

Matches your `git config user.name`.

### Find stale TODOs

```bash
todos stale        # older than 6 months
todos stale 30d    # older than 30 days
todos stale 1y     # older than 1 year
```

### Hot TODOs

```bash
todos hot
```

TODOs in files that changed in the last 14 days — the ones that actually matter.

### Stats dashboard

```bash
todos stats
```

Breakdown by type, author, age, priority, and trend over time.

### Triage mode

```bash
todos clean              # triage all TODOs
todos clean --mine       # only yours
todos clean --stale 3m   # only stale ones
todos clean -t HACK      # only HACKs
```

Walk through TODOs one by one and decide their fate:

- **Skip** — leave as is
- **Open** — open in your editor at the exact line, then mark as done or skip
- **Resolve** — remove the comment (the work is done)
- **Won't fix** — convert to `NOTE:` with a reason

Auto-detects your editor (Cursor, VS Code, Vim, Sublime, JetBrains, etc.) from running processes.

### Export

```bash
todos export --md                # markdown to stdout
todos export --md -o todos.md    # markdown to file
todos export --gh                # create GitHub issues (interactive picker)
```

### Watch mode

```bash
todos watch
```

Shows new TODOs as they appear in changed files.

## Options

```
-d, --dir <path>     directory to scan (default: cwd)
-s, --sort <field>   sort by: priority, age, file, author
-t, --type <types>   filter by type (comma-separated)
--no-context         hide surrounding code lines
--no-blame           skip git blame (faster)
```

## What it detects

| Keyword  | Color  | Default Priority |
|----------|--------|-----------------|
| TODO     | yellow | P3              |
| FIXME    | red    | P2              |
| HACK     | orange | P2              |
| XXX      | red bold | P1            |
| NOTE     | blue   | P4              |
| BUG      | red bold | P1            |
| OPTIMIZE | cyan   | P4              |

Priority is elevated by `TODO(P0)`, `TODO(urgent)`, `FIXME!!`, etc.

## Supported languages

JavaScript, TypeScript, Python, Go, Rust, Java, Ruby, C/C++, C#, Swift, Kotlin, Scala, Dart, PHP, Lua, SQL, Haskell, Elm, Elixir, Shell, YAML, TOML, HTML, CSS/SCSS, Vue, Svelte, Astro, and more.

Comment patterns (`//`, `#`, `--`, `/* */`, `<!-- -->`, etc.) are matched per file extension.

## How it works

1. **Scanner** walks the directory tree, respects `.gitignore`, and extracts comments using language-aware regex patterns
2. **Git integration** runs `git blame` on each TODO line to get author and timestamp
3. **Display** renders with color-coded tables, priority labels, and contextual code snippets

No AST parsing, no build step, no config files. Just regex and git.

## License

[MIT](LICENSE)
