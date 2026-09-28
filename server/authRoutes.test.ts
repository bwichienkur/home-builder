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

  it('logs in Builder20 Craftsmen guest by username', async () => {
    const result = await handleAuthRequest({
      method: 'POST',
      path: '/api/auth/login',
      body: { email: 'Craftsmen', password: 'Ericsthebest' },
      headers: {},
      query: {},
    });
    expect(result.status).toBe(200);
    expect(result.body.user.email).toBe('craftsmen@mahnikka.local');
    expect(result.body.user.role).toBe('client_viewer');
    expect(result.body.user.name).toBe('Craftsmen');
    expect(result.body.token).toBeTruthy();
  });

  it('logs in Olsen staff system admins', async () => {
    for (const account of [
      { email: 'tragno@olsencustomhomes.com', name: 'Trevor Ragno' },
      { email: 'eolsen@olsencustomhomes.com', name: 'Eric Olsen' },
    ]) {
      const result = await handleAuthRequest({
        method: 'POST',
        path: '/api/auth/login',
        body: { email: account.email, password: 'Password123!' },
      });
      expect(result.status).toBe(200);
      expect(result.body.user.email).toBe(account.email);
      expect(result.body.user.name).toBe(account.name);
      expect(result.body.user.role).toBe('system_admin');
    }
  });

  it('rejects login after expiresAt', async () => {
    const { __patchUserForTests } = await import('./authRoutes.js');
    const registered = await handleAuthRequest({
      method: 'POST',
      path: '/api/auth/register',
      body: {
        email: 'expired-guest@mahnikka.local',
        password: 'expired1',
        name: 'Expired Guest',
      },
    });
    expect([201, 409]).toContain(registered.status);
    await __patchUserForTests('expired-guest@mahnikka.local', {
      expiresAt: '2020-01-01T00:00:00.000Z',
    });
    const result = await handleAuthRequest({
      method: 'POST',
      path: '/api/auth/login',
      body: { email: 'expired-guest@mahnikka.local', password: 'expired1' },
    });
    expect(result.status).toBe(401);
    expect(String(result.body.error)).toMatch(/expired/i);
  });
});
