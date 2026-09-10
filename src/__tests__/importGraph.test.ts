/**
 * Static import-graph walker asserting the public entry points stay layered:
 * `"./git"` and the root entry must never reach an adapter module or
 * `forgeProviders`, so a consumer importing just the git core (or just the
 * domain model) never pulls provider code into their bundle. Walks `src/`
 * directly (not `dist/`) so this runs in the normal unit-test gate without
 * requiring a build.
 */
import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function extractRelativeSpecifiers(content: string): string[] {
  const specifiers: string[] = [];
  for (const m of content.matchAll(/from\s+['"](\.[^'"]+)['"]/g)) {
    specifiers.push(m[1]);
  }
  for (const m of content.matchAll(/(?:^|\n)\s*import\s+['"](\.[^'"]+)['"]/g)) {
    specifiers.push(m[1]);
  }
  return specifiers;
}

/** Resolves a relative specifier against its importer's repo-relative path, mapping `.js` back to `.ts` (this also covers `/index.js` → `/index.ts`, a plain instance of the same rule). */
function resolveRelativeImport(importerRepoPath: string, specifier: string): string {
  const importerDir = path.posix.dirname(importerRepoPath);
  const joined = path.posix.join(importerDir, specifier);
  return joined.endsWith('.js') ? `${joined.slice(0, -'.js'.length)}.ts` : joined;
}

/** Returns the set of repo-relative source files reached from `entryRepoPath`, transitively. */
function walkImportGraph(entryRepoPath: string, visited: Set<string> = new Set()): Set<string> {
  if (visited.has(entryRepoPath)) return visited;
  visited.add(entryRepoPath);

  const absolutePath = path.join(REPO_ROOT, entryRepoPath);
  const content = fs.readFileSync(absolutePath, 'utf-8');

  for (const specifier of extractRelativeSpecifiers(content)) {
    walkImportGraph(resolveRelativeImport(entryRepoPath, specifier), visited);
  }

  return visited;
}

describe('import graph — public entry-point layering', () => {
  it('"./git" entry point (src/git/index.ts) reaches no module under src/providers/', () => {
    const reached = walkImportGraph('src/git/index.ts');
    const offenders = [...reached].filter((p) => p.startsWith('src/providers/'));
    expect(offenders, `src/git/index.ts reached provider module(s): ${offenders.join(', ')}`).toEqual([]);
  });

  it('root entry point (src/index.ts) reaches no adapter module and not forgeProviders', () => {
    const reached = walkImportGraph('src/index.ts');
    const offenders = [...reached].filter(
      (p) =>
        p.startsWith('src/providers/github/') ||
        p.startsWith('src/providers/gitlab/') ||
        p.startsWith('src/providers/jira/') ||
        p === 'src/providers/forgeProviders.ts',
    );
    expect(offenders, `src/index.ts reached adapter/forgeProviders module(s): ${offenders.join(', ')}`).toEqual([]);
  });

  it('positive control: the walker actually traverses, so the assertions above are not vacuous', () => {
    const reachedProviders = walkImportGraph('src/providers/index.ts');
    expect(reachedProviders.has('src/providers/forgeProviders.ts')).toBe(true);
    expect([...reachedProviders].some((p) => p.startsWith('src/providers/github/'))).toBe(true);
    expect([...reachedProviders].some((p) => p.startsWith('src/providers/gitlab/'))).toBe(true);
    expect([...reachedProviders].some((p) => p.startsWith('src/providers/jira/'))).toBe(true);

    const reachedGit = walkImportGraph('src/git/index.ts');
    expect(reachedGit.size).toBeGreaterThan(1);
  });
});
