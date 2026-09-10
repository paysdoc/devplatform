/**
 * guardReport.ts — stdout-only report block for `scripts/checkGitGhGuard.ts`'s
 * `main()`, split out purely to keep the entry point short.
 *
 * Ported from ADW's `adws/guard/guardReport.ts`, with the permanent/sunset
 * split removed: this port's allowlist (`SANCTIONED_CONSTRUCTION_SITES`,
 * `scripts/guard/constructionRule.ts`) carries only permanent entries, so
 * there is no transitional half to report separately.
 *
 * Must never emit the substring "allowlisted" — that string is reserved for
 * the entry point's `(0 allowlisted)` capstone line.
 */

import { SANCTIONED_CONSTRUCTION_SITES } from './constructionRule.js';

/** Prints the sanctioned-construction-sites block. */
export function printSanctionedConstructionSites(): void {
  console.log(`  Sanctioned construction sites — ${SANCTIONED_CONSTRUCTION_SITES.length}:`);
  for (const site of SANCTIONED_CONSTRUCTION_SITES) {
    console.log(`    ${site.file} — ${site.reason}`);
  }
  console.log('');
}
