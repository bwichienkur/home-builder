import { describe, expect, it } from 'vitest';
import { handleAuthRequest } from './authRoutes.js';

describe('handleAuthRequest', () => {
  it('logs in the demo admin', async () => {
    const result = await handleAuthRequest({
      method: 'POST',
      path: '/api/auth/login',
      body: { email: 'admin@mahnikka.local', password: 'admin123' },
      headers: {},
      query: {},
    });
    expect(result.status).toBe(200);
    expect(result.body.user.email).toBe('admin@mahnikka.local');
    expect(result.body.user.role).toBe('system_admin');
    expect(result.body.token).toBeTruthy();
  });

  it('logs in seeded estimator and designer', async () => {
    const est = await handleAuthRequest({
      method: 'POST',
      path: '/api/auth/login',
      body: { email: 'estimator@mahnikka.local', password: 'estimator123' },
    });
    expect(est.status).toBe(200);
    expect(est.body.user.role).toBe('estimator');

    const des = await handleAuthRequest({
      method: 'POST',
      path: '/api/auth/login',
      body: { email: 'designer@mahnikka.local', password: 'designer123' },
    });
    expect(des.status).toBe(200);
    expect(des.body.user.role).toBe('designer');
  });

  it('lists users by role for signed-in staff', async () => {
    const login = await handleAuthRequest({
      method: 'POST',
      path: '/api/auth/login',
      body: { email: 'admin@mahnikka.local', password: 'admin123' },
    });
    const listed = await handleAuthRequest({
      method: 'GET',
      path: '/api/users',
      query: { role: 'estimator' },
      headers: { authorization: `Bearer ${login.body.token}` },
    });
    expect(listed.status).toBe(200);
    expect(listed.body.items.some((u: { role: string }) => u.role === 'estimator')).toBe(true);
  });

  it('rejects bad passwords', async () => {
    const result = await handleAuthRequest({
      method: 'POST',
      path: '/api/auth/login',
      body: { email: 'admin@mahnikka.local', password: 'wrong' },
      headers: {},
      query: {},
    });
    expect(result.status).toBe(401);
  });
});
