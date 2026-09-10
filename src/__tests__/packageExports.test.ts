/**
 * Asserts the `exports`/`files` contract in `package.json` matches the three
 * documented entry points and that every mapped `dist/` target has a
 * corresponding `src/` source file, so the manifest stays enforced by the
 * unit-test gate without requiring a build.
 */
import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

interface ExportCondition {
  types?: string;
  import?: string;
  default?: string;
}

interface PackageManifest {
  type?: string;
  files?: string[];
  exports?: Record<string, ExportCondition | string>;
}

function readPackageManifest(): PackageManifest {
  const raw = fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf-8');
  return JSON.parse(raw) as PackageManifest;
}

describe('package.json — exports/files contract', () => {
  const pkg = readPackageManifest();

  it('declares exactly the four documented exports keys', () => {
    expect(Object.keys(pkg.exports ?? {}).sort()).toEqual(['.', './git', './package.json', './providers']);
  });

  it('type is "module"', () => {
    expect(pkg.type).toBe('module');
  });

  it('files is exactly ["dist", "README.md", "LICENSE"] and contains no src', () => {
    expect(pkg.files).toEqual(['dist', 'README.md', 'LICENSE']);
    expect(pkg.files ?? []).not.toContain('src');
  });

  const subpathToSource: Record<string, string> = {
    '.': 'src/index.ts',
    './providers': 'src/providers/index.ts',
    './git': 'src/git/index.ts',
  };

  it.each(Object.entries(subpathToSource))('exports[%s] types/import point under dist/ and have a corresponding source file', (subpath, sourcePath) => {
    const condition = pkg.exports?.[subpath];
    expect(condition, `exports["${subpath}"] is missing`).toBeTypeOf('object');
    const { types, import: importCond } = condition as ExportCondition;

    expect(types, `exports["${subpath}"].types`).toMatch(/^\.\/dist\//);
    expect(importCond, `exports["${subpath}"].import`).toMatch(/^\.\/dist\//);

    expect(fs.existsSync(path.join(REPO_ROOT, sourcePath)), `expected source file ${sourcePath} to exist`).toBe(true);
  });

  it('exports["./package.json"] points at the manifest itself', () => {
    expect(pkg.exports?.['./package.json']).toBe('./package.json');
  });
});
