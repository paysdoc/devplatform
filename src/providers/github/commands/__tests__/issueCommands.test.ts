import { describe, it, expect } from 'vitest';
import { listOpenIssuesCmd } from '../issueCommands.js';

// Undefined for an absent flag, so a missing flag fails the assertion rather than reading an unrelated element.
function valueAfter(argv: readonly string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  return index === -1 ? undefined : argv[index + 1];
}

describe('listOpenIssuesCmd', () => {
  it('defaults to --state open when no state option is supplied', () => {
    const cmd = listOpenIssuesCmd('o', 'r', { fields: ['number'] });
    expect(valueAfter(cmd, '--state')).toBe('open');
  });

  it('emits --state all when state: "all" is supplied', () => {
    const cmd = listOpenIssuesCmd('o', 'r', { fields: ['number'], state: 'all' });
    expect(valueAfter(cmd, '--state')).toBe('all');
  });

  it('emits --state closed when state: "closed" is supplied', () => {
    const cmd = listOpenIssuesCmd('o', 'r', { fields: ['number'], state: 'closed' });
    expect(valueAfter(cmd, '--state')).toBe('closed');
  });

  it('still renders --search and --limit when supplied alongside state', () => {
    const cmd = listOpenIssuesCmd('o', 'r', { fields: ['number'], state: 'all', search: 'regression-promotion', limit: 200 });
    expect(valueAfter(cmd, '--search')).toBe('regression-promotion');
    expect(valueAfter(cmd, '--limit')).toBe('200');
  });
});
