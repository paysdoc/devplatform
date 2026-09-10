import { defineConfig } from 'vitest/config';

const junitReportPath = process.env.ADW_UNIT_TEST_REPORT_PATH;

export default defineConfig({
  test: {
    include: ['src/**/__tests__/**/*.test.ts'],
    reporters: junitReportPath
      ? ['default', ['junit', { outputFile: junitReportPath }]]
      : ['default'],
  },
});
