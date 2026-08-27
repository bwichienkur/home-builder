import { describe, expect, it } from 'vitest';
import { handleVercelRefresh, readJsonBodySync } from './vercelRefresh.js';

describe('readJsonBodySync', () => {
  it('parses object, string, and buffer bodies without streaming', () => {
    expect(readJsonBodySync({ body: { cookie: 'a=b' } })).toEqual({ cookie: 'a=b' });
    expect(readJsonBodySync({ body: '{"cookie":"x=y"}' })).toEqual({ cookie: 'x=y' });
    expect(readJsonBodySync({ body: Buffer.from('{"cookie":"p=q"}') })).toEqual({ cookie: 'p=q' });
    expect(readJsonBodySync({ body: null })).toEqual({});
  });
});

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

  it('rejects missing cookie when env is unset', async () => {
    const prev = process.env.BUILDERTREND_COOKIE;
    delete process.env.BUILDERTREND_COOKIE;
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
    try {
      await handleVercelRefresh({ method: 'POST', body: {} }, res);
      expect(res.statusCode).toBe(400);
      expect(res.body.code).toBe('credentials_missing');
    } finally {
      if (prev != null) process.env.BUILDERTREND_COOKIE = prev;
    }
  });
});
