/**
 * A stub `gh` executable placed first on `PATH`, for the hermetic scenarios
 * that drive a real spawn without a real GitHub CLI: the two `ghAuthToken()`
 * scenarios (issue #11) and the pull-request-creation scenario. `ghAuthToken`
 * and the default executor both spawn `gh` straight from `PATH`, so this is
 * the only way to drive them without the real tool. `PATH` is not one of the
 * World's managed env keys, so the caller is responsible for restoring it
 * (`world.ts`'s `After` hook does, reading `world.originalPath`).
 */
import type { DevPlatformWorld } from './world.js';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

export interface RecordedInvocation {
  readonly argv: readonly string[];
  readonly input?: string;
}

/** Writes an executable `gh` shell script whose body is `scriptBody`, and prepends its directory to `PATH`. */
export function installStubGh(world: DevPlatformWorld, scriptBody: string): void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'devplatform-stub-gh-'));
  fs.writeFileSync(path.join(dir, 'gh'), `#!/bin/sh\n${scriptBody}\n`, { mode: 0o755 });
  world.stubGhDir = dir;
  world.originalPath ??= process.env['PATH'];
  process.env['PATH'] = `${dir}${path.delimiter}${process.env['PATH'] ?? ''}`;
}

/**
 * Installs a `gh` that records instead of acting. Each invocation's arguments
 * go to their own file in the stub directory, NUL-separated so quotes and
 * newlines survive. `pr create` also saves its standard input and prints
 * `pullRequestUrl`; every other subcommand exits 0 with no output.
 */
export function installRecordingStubGh(world: DevPlatformWorld, pullRequestUrl: string): void {
  installStubGh(world, [
    'dir=$(dirname "$0")',
    'n=$(cat "$dir/count" 2>/dev/null || echo 0)',
    'n=$((n + 1))',
    'echo "$n" > "$dir/count"',
    'printf \'%s\\0\' "$@" > "$dir/call-$n.args"',
    'if [ "$1" = pr ] && [ "$2" = create ]; then',
    '  cat > "$dir/call-$n.stdin"',
    `  printf '%s\\n' ${JSON.stringify(pullRequestUrl)}`,
    'fi',
  ].join('\n'));
  world.stubGhRecording = true;
}

/** Reads back, in call order, every invocation the recording stub saw, each as the full argv with `gh` as element 0. */
export function readStubGhInvocations(dir: string): RecordedInvocation[] {
  const countFile = path.join(dir, 'count');
  const count = fs.existsSync(countFile) ? Number(fs.readFileSync(countFile, 'utf-8').trim()) : 0;
  const invocations: RecordedInvocation[] = [];
  for (let n = 1; n <= count; n++) {
    const args = fs.readFileSync(path.join(dir, `call-${n}.args`), 'utf-8').split('\0');
    args.pop();
    const stdinFile = path.join(dir, `call-${n}.stdin`);
    invocations.push({ argv: ['gh', ...args], input: fs.existsSync(stdinFile) ? fs.readFileSync(stdinFile, 'utf-8') : undefined });
  }
  return invocations;
}
