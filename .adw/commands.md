## Package Manager
bun

## Install Dependencies
bun install

## Run Linter
N/A (no linter configured in this repo)

## Type Check
bun run typecheck

## Run Tests
bun run test:unit

Note: `vitest.config.ts` already wires the JUnit reporter to `process.env.ADW_UNIT_TEST_REPORT_PATH`
when that env var is set (`reporters: junitReportPath ? ['default', ['junit', { outputFile: junitReportPath }]] : ['default']`),
so no `--reporter` flags are needed on the command line — just ensure `$ADW_UNIT_TEST_REPORT_PATH` is
exported in the environment before running.

## Run Build
N/A (no build/dist pipeline configured yet; package build and entry points are tracked in this
repository's issues per README.md)

## Start Dev Server
N/A (library/CLI package; no dev server)

## Health Check Path
N/A

## Prepare App
bun install

## Additional Type Checks
N/A

## Library Install Command
bun add <package>
bun add -d <package>   # dev dependency

## Script Execution
bun run <script-name>   # e.g. bun run typecheck, bun run test:unit
bunx tsx <file.ts>       # ad-hoc TypeScript script execution

## Run Scenarios by Tag
cucumber-js --tags "@{tag}"

## Run Regression Scenarios
cucumber-js --tags "@regression"
