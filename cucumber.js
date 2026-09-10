/**
 * Cucumber-js configuration for the BDD scenario suite.
 *
 * Scenarios live under `features/`: `features/per-issue/` holds the
 * agent-input scenarios for one issue each, `features/regression/` holds the
 * promoted regression suite plus its vocabulary registry.
 *
 * Step definitions are TypeScript and are transpiled by `tsx` (already a
 * devDependency), so they can import the library's own `src/` modules under the
 * repository's NodeNext resolution without a separate build step. `tsx` must be
 * registered through `NODE_OPTIONS="--import tsx"` rather than cucumber's
 * `loader` option, which still goes through Node's deprecated `--loader` hook —
 * the `test:e2e` script sets it.
 */
export default {
  paths: ['features/**/*.feature'],
  import: ['features/support/**/*.ts', 'features/step_definitions/**/*.ts'],
  format: ['progress', 'summary'],
  strict: true,
};
