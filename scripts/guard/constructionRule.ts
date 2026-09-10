/**
 * constructionRule.ts — the 'unsanctioned-construction' rule.
 *
 * Flags direct construction of a forge provider (IssueTracker / CodeHost /
 * BoardManager implementation), a call to the `forgeProviders` assembly
 * function, or a `new GitContext(…)` expression, anywhere outside a
 * file-scoped allowlist of sanctioned construction sites.
 * `src/providers/forgeProviders.ts` is this library's one sanctioned
 * assembly site — the only place identity selection and adapter
 * construction are allowed to happen. Everywhere else, a caller must
 * receive providers from `forgeProviders(...)` rather than minting its own.
 *
 * Ported from ADW's `adws/guard/constructionRule.ts` (#795). In ADW this
 * rule never saw `adws/gitContext/` or `adws/providers/github/`, because a
 * single whole-repo walk pruned both exempt packages before any rule ran.
 * **In this library the rule walks the whole tree instead**: the two
 * structurally-exempt packages (`src/git/`, `src/providers/github/`) *are*
 * almost the entire repo, so pruning them here would leave this rule
 * guarding almost nothing. Neither package gets an allowlist entry — neither
 * calls the adapter factories or `new GitContext` outside its own tests
 * (verified 2026-09-10).
 *
 * The flagged-callee set is an EXPLICIT NAME SET, never a `create*` pattern:
 * near-misses that must NOT be caught are `createGhCommandRunner` and
 * `createGitHubTokenProvider` (auth/token plumbing, not a provider or
 * context) and `createIssueCmd`-style pure command-string builders. Function
 * *declarations* are never flagged, only call/new expressions — and only
 * when the callee is a BARE IDENTIFIER: property-access callees
 * (`deps.forgeProviders(…)`, `d.forgeProviders(…)`) are an injected seam,
 * exactly the pattern this library's dependency-injection style wants, and
 * are deliberately unflagged.
 */

import * as ts from 'typescript';
import type { Violation } from './violationTypes.js';

// ---------------------------------------------------------------------------
// Flagged callee name sets
// ---------------------------------------------------------------------------

/** Forge provider implementation factories — an explicit name set, never a `create*` pattern. */
export const PROVIDER_CONSTRUCTORS: ReadonlySet<string> = new Set([
  'createGitHubIssueTracker',
  'createGitHubCodeHost',
  'createGitHubBoardManager',
  'createGitLabCodeHost',
  'createGitLabBoardManager',
  'createJiraIssueTracker',
  'createJiraBoardManager',
]);

/** The assembly function — this library's one sanctioned construction entry point. */
export const CONTEXT_CONSTRUCTORS: ReadonlySet<string> = new Set([
  'forgeProviders',
]);

/** Matched only as a `ts.NewExpression` callee — `new GitContext(…)`. */
export const GIT_CONTEXT_CLASS_NAME = 'GitContext';

// ---------------------------------------------------------------------------
// Sanctioned-site allowlist
// ---------------------------------------------------------------------------

/**
 * The file-scoped allowlist of sites permitted to construct a provider or
 * call `forgeProviders` — exactly one PERMANENT entry, the assembly module
 * itself. NOTHING MAY EVER BE ADDED TO THIS LIST — a new construction site
 * must call `forgeProviders`, not join the allowlist.
 */
export const SANCTIONED_CONSTRUCTION_SITES = [
  { file: 'src/providers/forgeProviders.ts', reason: 'the assembly module: the only site that calls the adapter factories' },
] as const;

/** True when `relPath` exactly matches a sanctioned site. Exact path match only — a directory prefix is never sanctioned. */
export function isSanctionedConstructionSite(relPath: string): boolean {
  return SANCTIONED_CONSTRUCTION_SITES.some(({ file }) => file === relPath);
}

// ---------------------------------------------------------------------------
// AST detection
// ---------------------------------------------------------------------------

function isFlaggedProviderOrContextCallee(expression: ts.Expression): boolean {
  return ts.isIdentifier(expression) && (PROVIDER_CONSTRUCTORS.has(expression.text) || CONTEXT_CONSTRUCTORS.has(expression.text));
}

function isGitContextClassCallee(expression: ts.Expression): boolean {
  return ts.isIdentifier(expression) && expression.text === GIT_CONTEXT_CLASS_NAME;
}

/** Returns the violation's `command` description when `node` is a flagged construction, else null. */
function describeUnsanctionedConstructionNode(node: ts.Node): string | null {
  if (ts.isNewExpression(node) && isGitContextClassCallee(node.expression)) {
    return 'new GitContext(…)';
  }
  if (ts.isCallExpression(node) && isFlaggedProviderOrContextCallee(node.expression)) {
    return `${(node.expression as ts.Identifier).text}(…)`;
  }
  return null;
}

/**
 * Flags unsanctioned provider/context construction in `sourceFile`. Guard
 * clause first: a sanctioned site is never walked, keeping the allowlist a
 * single, greppable decision.
 */
export function flagUnsanctionedConstruction(sourceFile: ts.SourceFile, relPath: string): Violation[] {
  if (isSanctionedConstructionSite(relPath)) return [];

  const violations: Violation[] = [];
  const visit = (node: ts.Node): void => {
    const command = describeUnsanctionedConstructionNode(node);
    if (command !== null) {
      const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      violations.push({ file: sourceFile.fileName, line: line + 1, command, rule: 'unsanctioned-construction' });
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return violations;
}
