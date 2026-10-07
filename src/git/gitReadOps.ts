/**
 * Package-private git-read op module for GitContext.
 * Handles phase-level read commands: tracked-file listing, short HEAD hash,
 * branch diff, and commit-history log.
 *
 * All functions propagate errors — each call site handles its own try/catch.
 */

type Runner = (argv: readonly string[], cwd: string) => string;

function lsFiles(run: Runner, cwd: string, prefix?: string): string[] {
  const argv = prefix ? ['git', 'ls-files', prefix] : ['git', 'ls-files'];
  return run(argv, cwd).split('\n').filter(Boolean);
}

function headShort(run: Runner, cwd: string): string {
  return run(['git', 'rev-parse', '--short', 'HEAD'], cwd);
}

function diff(run: Runner, range: string, cwd: string): string {
  return run(['git', 'diff', range], cwd);
}

function log(run: Runner, branchName: string, cwd: string): string {
  return run(['git', 'log', branchName, '--format=%aI %s', '--no-merges'], cwd);
}

function show(run: Runner, ref: string, filePath: string, cwd: string): string {
  return run(['git', 'show', `${ref}:${filePath}`], cwd);
}

/** Bounded flag vocabulary for git log --since reads; only assembles a log command. */
export interface LogSinceOptions {
  since: string;
  grep?: string;
  oneline?: boolean;
  patch?: boolean;
  pathspec?: string;
}

/** Bounded git log --since read; only assembles a log command. */
function logSince(run: Runner, opts: LogSinceOptions, cwd: string): string {
  const argv = ['git', 'log', `--since=${opts.since}`];
  if (opts.grep) argv.push(`--grep=${opts.grep}`);
  argv.push('--no-merges');
  if (opts.oneline) argv.push('--oneline');
  if (opts.patch) argv.push('-p');
  if (opts.pathspec) argv.push('--', opts.pathspec);
  return run(argv, cwd);
}

export const gitReadOps = { lsFiles, headShort, diff, log, show, logSince };
