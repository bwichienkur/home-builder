import { describe, expect, it } from 'vitest';
import { NAV_GROUPS, pageTitleForPath } from './navConfig';

describe('app nav', () => {
  it('groups studio, office, operations, and account destinations', () => {
    expect(NAV_GROUPS.map((g) => g.id)).toEqual(['studio', 'office', 'operations', 'account']);
    expect(NAV_GROUPS.flatMap((g) => g.items.map((i) => i.to))).toEqual([
      '/',
      '/build',
      '/plans',
      '/clients',
      '/vendors',
      '/inventory',
      '/ops',
      '/ops/jobs',
      '/ops/tasks',
      '/ops/logs',
      '/ops/selections',
      '/ops/deals',
      '/ops/people',
      '/ops/reports',
      '/config',
      '/settings',
      '/users',
      '/docs/api',
    ]);
  });

  it('titles the current page for the shared top bar', () => {
    expect(pageTitleForPath('/')).toBe('Overview');
    expect(pageTitleForPath('/build')).toBe('Build');
    expect(pageTitleForPath('/config')).toBe('Config');
    expect(pageTitleForPath('/inventory')).toBe('Materials');
    expect(pageTitleForPath('/ops')).toBe('Operations');
    expect(pageTitleForPath('/ops/jobs')).toBe('Jobs');
    expect(pageTitleForPath('/ops/tasks')).toBe('Tasks');
    expect(pageTitleForPath('/ops/reports')).toBe('Reports');
    expect(pageTitleForPath('/ops/reports/wip')).toBe('Reports');
    expect(pageTitleForPath('/ops/jobs/bt-1')).toBe('Jobs');
    expect(pageTitleForPath('/unknown')).toBe('Olsen Custom Homes');
  });

  it('gives every destination an icon', () => {
    expect(NAV_GROUPS.flatMap((g) => g.items).every((item) => item.icon)).toBe(true);
  });
});
