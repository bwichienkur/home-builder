/** Olsen Custom Homes system admins — seeded into local + Neon auth stores. */

export type StaffAdminSeed = {
  email: string;
  id: string;
  name: string;
  password: string;
  role: 'system_admin';
};

export const STAFF_ADMINS: StaffAdminSeed[] = [
  {
    email: 'tragno@olsencustomhomes.com',
    id: '00000000-0000-4000-8000-000000000007',
    name: 'Trevor Ragno',
    password: 'Password123!',
    role: 'system_admin',
  },
  {
    email: 'eolsen@olsencustomhomes.com',
    id: '00000000-0000-4000-8000-000000000008',
    name: 'Eric Olsen',
    password: 'Password123!',
    role: 'system_admin',
  },
];

export const STAFF_ADMIN_EMAILS = new Set(STAFF_ADMINS.map((a) => a.email));
