import { describe, expect, it } from 'vitest';
import { errorCodeFromUnknown, formatUnknownError } from './httpError';

describe('formatUnknownError', () => {
  it('keeps plain strings', () => {
    expect(formatUnknownError('Cookie rejected', 'fallback')).toBe('Cookie rejected');
  });

  it('unwraps Error messages', () => {
    expect(formatUnknownError(new Error('Nope'), 'fallback')).toBe('Nope');
  });

  it('unwraps nested API error objects instead of [object Object]', () => {
    expect(
      formatUnknownError({ error: { message: 'FUNCTION_INVOCATION_FAILED', code: '500' } }, 'fallback'),
    ).toBe('FUNCTION_INVOCATION_FAILED');
    expect(formatUnknownError({ error: { code: 'cookie_rejected' } }, 'fallback')).toBe(
      JSON.stringify({ code: 'cookie_rejected' }),
    );
  });

  it('reads code from thrown refresh errors', () => {
    const err = Object.assign(new Error('bad cookie'), { code: 'cookie_rejected' });
    expect(errorCodeFromUnknown(err)).toBe('cookie_rejected');
  });
});
