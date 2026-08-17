export type NavItem = {
  to: string;
  label: string;
  end?: boolean;
  adminOnly?: boolean;
};

export type NavGroup = {
  id: string;
  label: string;
  items: NavItem[];
};

export const NAV_GROUPS: NavGroup[] = [
  {
    id: 'studio',
    label: 'Studio',
    items: [
      { to: '/', label: 'Home', end: true },
      { to: '/build', label: 'Build' },
      { to: '/plans', label: 'Plans' },
    ],
  },
  {
    id: 'office',
    label: 'Office',
    items: [
      { to: '/clients', label: 'Clients' },
      { to: '/vendors', label: 'Vendors' },
      { to: '/inventory', label: 'Materials' },
    ],
  },
  {
    id: 'account',
    label: 'Account',
    items: [
      { to: '/settings', label: 'Settings' },
      { to: '/users', label: 'Users', adminOnly: true },
      { to: '/docs/api', label: 'API docs' },
    ],
  },
];

export const PAGE_TITLES: { path: string; end?: boolean; title: string }[] = [
  { path: '/', end: true, title: 'Home' },
  { path: '/build', title: 'Build' },
  { path: '/clients', title: 'Clients' },
  { path: '/vendors', title: 'Vendors' },
  { path: '/inventory', title: 'Materials' },
  { path: '/plans', title: 'Plans' },
  { path: '/settings', title: 'Settings' },
  { path: '/users', title: 'Users' },
];

export function pageTitleForPath(pathname: string): string {
  const match = PAGE_TITLES.find((item) =>
    item.end ? pathname === item.path : pathname === item.path || pathname.startsWith(`${item.path}/`),
  );
  return match?.title ?? 'Mahnikka';
}
