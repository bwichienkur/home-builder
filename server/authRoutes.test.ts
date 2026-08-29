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

  it('resolves rewrite-style login path via explicit path', async () => {
    // Vercel rewrite restores __path=login → /api/auth/login before dispatch
    const result = await handleAuthRequest({
      method: 'POST',
      path: '/api/auth/login',
      body: { email: 'admin@mahnikka.local', password: 'admin123' },
    });
    expect(result.status).toBe(200);
  });
});
