import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AuthUser } from '../lib/platform/authProvider';
import { getAuthProvider } from '../lib/platform/getAuthProvider';
import { DEMO_LOGIN } from '../lib/platform/localAuthProvider';

type AuthState = {
  user: AuthUser | null;
  token: string | null;
  hydratedRemote: boolean;
  login: (email: string, password: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  register: (email: string, password: string, name: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  logout: () => Promise<void>;
  /** Call once on app boot when using remote auth. */
  restoreSession: () => Promise<void>;
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      hydratedRemote: false,
      login: async (email, password) => {
        const result = await getAuthProvider().login(email, password);
        if (!result.ok) return { ok: false, error: result.error };
        set({ user: result.user, token: result.token ?? get().token });
        return { ok: true };
      },
      register: async (email, password, name) => {
        const result = await getAuthProvider().register(email, password, name);
        if (!result.ok) return { ok: false, error: result.error };
        set({ user: result.user, token: result.token ?? get().token });
        return { ok: true };
      },
      logout: async () => {
        await getAuthProvider().logout(get().token);
        set({ user: null, token: null });
      },
      restoreSession: async () => {
        const provider = getAuthProvider();
        if (!provider.restoreSession) {
          set({ hydratedRemote: true });
          return;
        }
        const user = await provider.restoreSession();
        if (user) set({ user, hydratedRemote: true });
        else set({ user: null, token: null, hydratedRemote: true });
      },
    }),
    {
      name: 'mahnikka-auth-session-v1',
      partialize: (s) => ({ user: s.user, token: s.token }),
    },
  ),
);

export { DEMO_LOGIN };
