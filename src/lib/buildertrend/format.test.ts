import { describe, expect, it } from 'vitest';
import { formatMonthsDays, splitMonthsDays } from './format';

describe('formatMonthsDays', () => {
  it('splits days into 30-day months plus remainder', () => {
    expect(splitMonthsDays(244)).toEqual({ months: 8, days: 4 });
    expect(formatMonthsDays(244)).toBe('8 months 4 days');
  });

  it('omits zero-day remainder', () => {
    expect(formatMonthsDays(420)).toBe('14 months');
  });

  it('handles sub-month durations', () => {
    expect(formatMonthsDays(4)).toBe('4 days');
    expect(formatMonthsDays(0)).toBe('0 days');
  });
});
