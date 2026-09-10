/**
 * checkGitGhGuard.ts — CI guard: fail on direct git/gh shell-outs outside
 * the two structurally-exempt packages, or on ad-hoc provider/context
 * construction outside the sanctioned-site allowlist.
 *
 * Two independent rules:
 *
 *  - 'git-gh-shellout' — implemented in this file (`walkNode`/`extractGitGhCommand`).
 *  - 'unsanctioned-construction' — `scripts/guard/constructionRule.ts`.
 *
 * Ported from ADW's four-rule `adws/checkGitGhGuard.ts`. Two of ADW's rules
 * are deliberately not ported:
 *
 *  - 'cwd-derived-identity' guards a *consumer* composing cwd-derived
 *    identity into a context/provider factory. Nothing inside this library
 *    calls `forgeProviders` outside tests, so there is no consumer here to
 *    guard.
 *  - 'extraction-readiness' asserted that ADW's extractable packages import
 *    nothing from the rest of the ADW framework. Here the extractable
 *    packages are the whole repo, so the rule would have nothing to guard.
 *
 * The shell-out exempt set is closed and named (EXEMPT_PACKAGES): exactly
 * two packages may shell out — the git core (`src/git`), which may run git
 * commands, and the GitHub forge adapter (`src/providers/github`), which may
 * issue gh commands by feeding command strings into the core's executor.
 *
 * Unlike ADW, EXEMPT_PACKAGES is not pruned from discovery: `collectTsFiles`
 * walks the whole tree once, pruning only EXEMPT_DIR_NAMES. `scanSource`
 * applies the shell-out rule only outside the exempt packages, but always
 * applies the construction rule (subject to its own allowlist) — see
 * `scripts/guard/constructionRule.ts`'s docblock for why the construction
 * rule cannot be pruned the way ADW pruned it.
 *
 * Any violation exits 1 (build fail).
 *
 * Run via: bunx tsx scripts/checkGitGhGuard.ts
 * Exits 0 if no violations found, 1 if any violations are detected.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as ts from 'typescript';
import type { Violation, ViolationRule } from './guard/violationTypes.js';
import { flagUnsanctionedConstruction } from './guard/constructionRule.js';
import { printSanctionedConstructionSites } from './guard/guardReport.js';

export type { Violation, ViolationRule };

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Directory basenames never descended into — covers deps, build output, worktrees, and config. */
const EXEMPT_DIR_NAMES = new Set([
  'node_modules', 'dist', '.worktrees', '.claude',
  'features', // BDD step definitions legitimately use git/gh for fixture-repo setup
  'test',     // test-mock / test-utility files — same rationale
]);

/**
 * The closed, CI-enforced set of packages permitted to shell out. Exactly
 * two: the git core, which may run git commands, and the GitHub forge
 * adapter, which may issue gh commands by feeding command strings into the
 * core's executor (GitContext.exec) — never by spawning a process itself.
 */
export const EXEMPT_PACKAGES = [
  {
    dir: 'src/git',
    role: 'git core — the only package that may run git commands',
  },
  {
    dir: 'src/providers/github',
    role: 'GitHub forge adapter — the only package whose gh call sites may feed the core executor',
  },
] as const;

/** True when `relPath` is one of EXEMPT_PACKAGES' directories, or a path beneath one. */
export function isExemptPackage(relPath: string): boolean {
  return EXEMPT_PACKAGES.some(({ dir }) => relPath === dir || relPath.startsWith(`${dir}/`));
}

/** Matches a git or gh command string: starts with 'git '/'gh ' or is exactly 'git'/'gh'. */
const GIT_GH_RE = /^(git|gh)(\s|$)/;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ScanResult = { violations: Violation[]; scannedCount: number };

// ---------------------------------------------------------------------------
// I/O boundary — filesystem reads isolated here
// ---------------------------------------------------------------------------

/**
 * Exported for tests: walks `startDir`, honouring EXEMPT_DIR_NAMES. Unlike
 * ADW, EXEMPT_PACKAGES is not pruned here — the two exempt packages are
 * discovered like any other files and filtered per-rule inside `scanSource`,
 * because the construction rule must see them.
 */
export function collectTsFiles(startDir: string, repoRoot: string): string[] {
  const acc: string[] = [];
  visitDir(startDir, repoRoot, acc);
  return acc;
}

function visitDir(dir: string, repoRoot: string, acc: string[]): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    const relPath = path.relative(repoRoot, fullPath).split(path.sep).join('/');

    if (entry.isDirectory()) {
      if (!EXEMPT_DIR_NAMES.has(entry.name)) {
        visitDir(fullPath, repoRoot, acc);
      }
      continue;
    }

    if (entry.isFile() && isScannable(entry.name, relPath)) {
      acc.push(relPath);
    }
  }
}

function isScannable(name: string, relPath: string): boolean {
  if (!name.endsWith('.ts') && !name.endsWith('.tsx')) return false;
  if (name.endsWith('.test.ts') || name.endsWith('.test.tsx')) return false;
  if (relPath.includes('/__tests__/') || relPath.startsWith('__tests__/')) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Pure scan core — no I/O
// ---------------------------------------------------------------------------

/**
 * Scans collected source files for git/gh shell-outs and unsanctioned
 * construction. Reads each file from disk, parses with the TypeScript
 * compiler API (AST-based, so comments are never false-positives), and
 * returns all violations found.
 */
export function scanFiles(relPaths: readonly string[], repoRoot: string): ScanResult {
  const violations: Violation[] = [];
  let scannedCount = 0;

  for (const relPath of relPaths) {
    scannedCount++;
    const source = fs.readFileSync(path.join(repoRoot, relPath), 'utf-8');
    violations.push(...scanSource(relPath, source));
  }

  return { violations, scannedCount };
}

function scanSource(filePath: string, source: string): Violation[] {
  const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, false);
  const violations: Violation[] = [];

  violations.push(...flagUnsanctionedConstruction(sourceFile, filePath));

  if (!isExemptPackage(filePath)) {
    walkNode(sourceFile, sourceFile, violations);
  }

  return violations;
}

// ── Rule: git-gh-shellout ────────────────────────────────────────────────────

function walkNode(node: ts.Node, sourceFile: ts.SourceFile, violations: Violation[]): void {
  if (ts.isCallExpression(node) && node.arguments.length > 0) {
    const cmd = extractGitGhCommand(node.arguments[0]);
    if (cmd !== null) {
      const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      violations.push({ file: sourceFile.fileName, line: line + 1, command: cmd, rule: 'git-gh-shellout' });
    }
  }
  ts.forEachChild(node, (child) => walkNode(child, sourceFile, violations));
}

function extractGitGhCommand(node: ts.Node): string | null {
  if (ts.isStringLiteral(node) && GIT_GH_RE.test(node.text)) return node.text;
  if (ts.isNoSubstitutionTemplateLiteral(node) && GIT_GH_RE.test(node.text)) return node.text;
  if (ts.isTemplateExpression(node) && GIT_GH_RE.test(node.head.text)) {
    return node.head.text + '${...}';
  }
  return null;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  const repoRoot = process.cwd();
  const allFiles = collectTsFiles(repoRoot, repoRoot);
  const { violations, scannedCount } = scanFiles(allFiles, repoRoot);

  console.log(`\nGit/GH CLI Guard — scanned ${scannedCount} files (0 allowlisted)\n`);
  console.log('  Exempt packages (2):');
  for (const { dir, role } of EXEMPT_PACKAGES) {
    console.log(`    ${dir} — ${role}`);
  }
  console.log('');
  printSanctionedConstructionSites();

  if (violations.length === 0) {
    console.log('  ✔ PASS  No direct git/gh shell-outs outside the exempt packages.');
    console.log('  ✔ PASS  Construction confined to the assembly module.\n');
    process.exit(0);
  }

  console.log(`  ✖ FAIL  ${violations.length} violation(s) detected:\n`);
  for (const { file, line, command, rule } of violations) {
    console.log(`  ${file}:${line}  [${rule}]  ${command}`);
  }
  console.log(
    '\n  Remedy (git-gh-shellout): route through GitContext, or place the code inside src/git (git) or src/providers/github (gh).' +
    '\n  Remedy (unsanctioned-construction): receive providers from forgeProviders(...) instead of constructing them.\n',
  );

  process.exit(1);
}

// Run main only when executed as a script, not when imported as a module.
if (process.argv[1]?.includes('checkGitGhGuard')) main();
