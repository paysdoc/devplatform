/**
 * Dynamic-import loader for the two barrels issue #11 widens, shared by every
 * public-surface step module. Resolving through a dynamic `import()` inside
 * each `When` step — rather than a static import at module load time — means
 * a missing re-export fails only the scenario that needs it, with a legible
 * message, instead of aborting the whole run at support-code load time (the
 * same pattern `forgeCredentials.steps.ts` uses for issue #9).
 */

export async function loadProviders(): Promise<Record<string, unknown>> {
  return (await import('../../src/providers/index.js')) as unknown as Record<string, unknown>;
}

export async function loadGit(): Promise<Record<string, unknown>> {
  return (await import('../../src/git/index.js')) as unknown as Record<string, unknown>;
}

/** Resolves `name` off an already-loaded barrel module, throwing a message naming the missing export and its subpath. */
export function resolveExport<T>(mod: Record<string, unknown>, name: string, subpath: string): T {
  const value = mod[name];
  if (value === undefined) {
    throw new Error(`expected "${name}" to be exported from @paysdoc/devplatform/${subpath}`);
  }
  return value as T;
}
