import { platformConfig } from './config';
import type { AuthProvider } from './authProvider';
import { LocalAuthProvider } from './localAuthProvider';
import { RemoteAuthProvider } from './remoteAuthProvider';

let cached: AuthProvider | null = null;

export function getAuthProvider(): AuthProvider {
  if (cached) return cached;
  cached = platformConfig.authProvider === 'remote' ? new RemoteAuthProvider() : new LocalAuthProvider();
  return cached;
}

/** Test helper — clear singleton between cases. */
export function resetAuthProviderCache() {
  cached = null;
}
