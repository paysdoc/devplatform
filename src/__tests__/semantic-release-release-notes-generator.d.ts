/**
 * `@semantic-release/release-notes-generator` ships no type declarations.
 * This covers only the `generateNotes` export shape exercised by
 * `releaseConfig.test.ts`.
 */
declare module '@semantic-release/release-notes-generator' {
  interface GenerateNotesCommit {
    hash: string;
    message: string;
  }

  interface GenerateNotesLogger {
    log(...args: unknown[]): void;
    error(...args: unknown[]): void;
  }

  interface GenerateNotesRelease {
    version?: string;
    gitTag?: string;
    gitHead?: string;
    type?: string;
  }

  interface GenerateNotesContext {
    commits: GenerateNotesCommit[];
    logger: GenerateNotesLogger;
    cwd: string;
    env: Record<string, string | undefined>;
    options: { repositoryUrl: string } & Record<string, unknown>;
    lastRelease: GenerateNotesRelease;
    nextRelease: GenerateNotesRelease;
  }

  interface GenerateNotesPluginConfig {
    preset?: string;
    parserOpts?: Record<string, unknown>;
    writerOpts?: Record<string, unknown>;
  }

  export function generateNotes(
    pluginConfig: GenerateNotesPluginConfig,
    context: GenerateNotesContext,
  ): Promise<string>;
}
