/**
 * `@semantic-release/commit-analyzer` ships no type declarations. This
 * covers only the `analyzeCommits` export shape exercised by
 * `releaseParser.test.ts`.
 */
declare module '@semantic-release/commit-analyzer' {
  interface AnalyzeCommitsCommit {
    hash: string;
    message: string;
  }

  interface AnalyzeCommitsLogger {
    log(...args: unknown[]): void;
    error(...args: unknown[]): void;
  }

  interface AnalyzeCommitsContext {
    commits: AnalyzeCommitsCommit[];
    logger: AnalyzeCommitsLogger;
    cwd: string;
    env: Record<string, string | undefined>;
    options: Record<string, unknown>;
  }

  interface AnalyzeCommitsPluginConfig {
    preset?: string;
    parserOpts?: Record<string, unknown>;
  }

  export function analyzeCommits(
    pluginConfig: AnalyzeCommitsPluginConfig,
    context: AnalyzeCommitsContext,
  ): Promise<string | null>;
}
