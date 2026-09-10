/**
 * violationTypes.ts — cross-rule types shared by the git/gh guard's entry
 * point (`scripts/checkGitGhGuard.ts`) and its rule module
 * (`scripts/guard/constructionRule.ts`).
 *
 * Kept in their own module so a rule module never has to import the entry
 * point (which would invert the dependency direction) just to name its own
 * violation shape.
 *
 * Ported from ADW's `adws/guard/violationTypes.ts`, narrowed to the two
 * rules this library ports — see `scripts/checkGitGhGuard.ts`'s docblock for
 * why the other two ADW rules ('cwd-derived-identity', 'extraction-readiness')
 * are not carried over.
 */

/** The guard's two independent AST rules. */
export type ViolationRule = 'git-gh-shellout' | 'unsanctioned-construction';

/** One detected violation: where it was found, what was seen, and which rule fired. */
export type Violation = { file: string; line: number; command: string; rule: ViolationRule };
