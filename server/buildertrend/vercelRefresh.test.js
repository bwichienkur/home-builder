import { describe, expect, it } from 'vitest';
import { handleVercelRefresh } from './vercelRefresh.js';

describe('handleVercelRefresh', () => {
  it('rejects non-POST', async () => {
    const headers = {};
    const res = {
      headersSent: false,
      statusCode: 0,
      body: null,
      setHeader(k, v) {
        headers[k] = v;
      },
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        this.body = payload;
        return this;
      },
    };
    await handleVercelRefresh({ method: 'GET' }, res);
    expect(res.statusCode).toBe(405);
    expect(res.body.ok).toBe(false);
  });

  it('rejects missing cookie', async () => {
    const res = {
      headersSent: false,
      statusCode: 0,
      body: null,
      setHeader() {},
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        this.body = payload;
        return this;
      },
    };
    await handleVercelRefresh({ method: 'POST', body: {} }, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('credentials_missing');
  });
});
