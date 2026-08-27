import { beforeEach, describe, expect, it } from 'vitest';
import {
  LIVE_PD_PULL_STORAGE_KEY,
  clearStoredPipedrivePull,
  loadStoredPipedrivePull,
  storePipedrivePull,
} from './refreshClient';

function installMemoryLocalStorage() {
  const map = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
      setItem: (k: string, v: string) => {
        map.set(k, String(v));
      },
      removeItem: (k: string) => {
        map.delete(k);
      },
      clear: () => map.clear(),
    },
    configurable: true,
  });
}

describe('pipedrive refreshClient storage', () => {
  beforeEach(() => {
    installMemoryLocalStorage();
  });

  it('stores and loads a live pull', () => {
    storePipedrivePull({
      pulledAt: '2026-08-27T12:31:41.055Z',
      reports: { openDeals: [], wonDeals: [] },
    });
    expect(loadStoredPipedrivePull()?.pulledAt).toBe('2026-08-27T12:31:41.055Z');
    expect(localStorage.getItem(LIVE_PD_PULL_STORAGE_KEY)).toContain('openDeals');
    clearStoredPipedrivePull();
    expect(loadStoredPipedrivePull()).toBeNull();
  });
});
