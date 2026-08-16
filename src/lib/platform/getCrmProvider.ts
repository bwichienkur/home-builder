import { platformConfig } from './config';
import type { CrmProvider } from './crmProvider';
import { LocalCrmProvider } from './localCrmProvider';
import { HttpCrmProvider } from './httpCrmProvider';

let cached: CrmProvider | null = null;

export function getCrmProvider(): CrmProvider {
  if (cached) return cached;
  cached = platformConfig.crmProvider === 'http' ? new HttpCrmProvider() : new LocalCrmProvider();
  return cached;
}

export function resetCrmProviderCache() {
  cached = null;
}
