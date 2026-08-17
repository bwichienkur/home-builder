import type { LucideIcon } from 'lucide-react';
import {
  BookOpen,
  Box,
  Boxes,
  House,
  LayoutTemplate,
  Settings,
  Shield,
  Store,
  Users,
} from 'lucide-react';

export type NavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
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
      { to: '/', label: 'Home', icon: House, end: true },
      { to: '/build', label: 'Build', icon: Box },
      { to: '/plans', label: 'Plans', icon: LayoutTemplate },
    ],
  },
  {
    id: 'office',
    label: 'Office',
    items: [
      { to: '/clients', label: 'Clients', icon: Users },
      { to: '/vendors', label: 'Vendors', icon: Store },
      { to: '/inventory', label: 'Materials', icon: Boxes },
    ],
  },
  {
    id: 'account',
    label: 'Account',
    items: [
      { to: '/settings', label: 'Settings', icon: Settings },
      { to: '/users', label: 'Users', icon: Shield, adminOnly: true },
      { to: '/docs/api', label: 'API docs', icon: BookOpen },
    ],
  },
];

export const PAGE_TITLES: { path: string; end?: boolean; title: string }[] = [
  { path: '/', end: true, title: 'Projects' },
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
