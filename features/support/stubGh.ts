/**
 * A stub `gh` executable placed first on `PATH`, for the two hermetic
 * `ghAuthToken()` scenarios (issue #11) — `ghAuthToken` spawns `gh auth
 * token` through the shell, so this is the only way to drive it without a
 * real GitHub CLI. `PATH` is not one of the World's managed env keys, so the
 * caller is responsible for restoring it (`world.ts`'s `After` hook does,
 * reading `world.originalPath`).
 */
import type { DevPlatformWorld } from './world.js';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

/** Writes an executable `gh` shell script whose body is `scriptBody`, and prepends its directory to `PATH`. */
export function installStubGh(world: DevPlatformWorld, scriptBody: string): void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'devplatform-stub-gh-'));
  fs.writeFileSync(path.join(dir, 'gh'), `#!/bin/sh\n${scriptBody}\n`, { mode: 0o755 });
  world.stubGhDir = dir;
  world.originalPath ??= process.env['PATH'];
  process.env['PATH'] = `${dir}${path.delimiter}${process.env['PATH'] ?? ''}`;
}
