import { describe, expect, it } from 'vitest';
import { NAV_GROUPS, pageTitleForPath } from './navConfig';

describe('app nav', () => {
  it('groups studio, office, and account destinations', () => {
    expect(NAV_GROUPS.map((g) => g.id)).toEqual(['studio', 'office', 'account']);
    expect(NAV_GROUPS.flatMap((g) => g.items.map((i) => i.to))).toEqual([
      '/',
      '/build',
      '/plans',
      '/clients',
      '/vendors',
      '/inventory',
      '/settings',
      '/users',
      '/docs/api',
    ]);
  });

  it('titles the current page for the shared top bar', () => {
    expect(pageTitleForPath('/')).toBe('Home');
    expect(pageTitleForPath('/build')).toBe('Build');
    expect(pageTitleForPath('/inventory')).toBe('Materials');
    expect(pageTitleForPath('/unknown')).toBe('Mahnikka');
  });
});
