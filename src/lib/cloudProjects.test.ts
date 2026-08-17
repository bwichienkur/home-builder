import { afterEach, describe, expect, it, vi } from 'vitest';
import { readCloudProjectIdFromLocation, readNewProjectFromLocation } from './cloudProjects';

describe('cloud project location params', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reads a cloud project id from the query string', () => {
    vi.stubGlobal('location', new URL('http://localhost:5173/build?cloud=abc-123'));
    expect(readCloudProjectIdFromLocation()).toBe('abc-123');
  });

  it('detects a new-project request', () => {
    vi.stubGlobal('location', new URL('http://localhost:5173/build?new=1'));
    expect(readNewProjectFromLocation()).toBe(true);
    vi.stubGlobal('location', new URL('http://localhost:5173/build?design=ABCD'));
    expect(readNewProjectFromLocation()).toBe(false);
  });
});
