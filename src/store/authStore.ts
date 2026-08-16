import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AuthUser } from '../lib/platform/authProvider';
import { getAuthProvider } from '../lib/platform/getAuthProvider';
import { DEMO_LOGIN } from '../lib/platform/localAuthProvider';

type AuthState = {
  user: AuthUser | null;
  token: string | null;
  /** True after localStorage rehydrate + optional remote restoreSession. */
  sessionReady: boolean;
  login: (email: string, password: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  register: (email: string, password: string, name: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  logout: () => Promise<void>;
  /** Call once on app boot (and from RequireAuth) to finish session restore. */
  restoreSession: () => Promise<void>;
  markSessionReady: () => void;
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      sessionReady: false,
      markSessionReady: () => set({ sessionReady: true }),
      login: async (email, password) => {
        const result = await getAuthProvider().login(email, password);
        if (!result.ok) return { ok: false, error: result.error };
        set({ user: result.user, token: result.token ?? get().token, sessionReady: true });
        return { ok: true };
      },
      register: async (email, password, name) => {
        const result = await getAuthProvider().register(email, password, name);
        if (!result.ok) return { ok: false, error: result.error };
        set({ user: result.user, token: result.token ?? get().token, sessionReady: true });
        return { ok: true };
      },
      logout: async () => {
        await getAuthProvider().logout(get().token);
        set({ user: null, token: null, sessionReady: true });
      },
      restoreSession: async () => {
        const provider = getAuthProvider();
        if (!provider.restoreSession) {
          set({ sessionReady: true });
          return;
        }
        try {
          const user = await provider.restoreSession();
          if (user) set({ user, sessionReady: true });
          else set({ user: null, token: null, sessionReady: true });
        } catch {
          set({ user: null, token: null, sessionReady: true });
        }
      },
    }),
    {
      name: 'mahnikka-auth-session-v1',
      partialize: (s) => ({ user: s.user, token: s.token }),
      onRehydrateStorage: () => (state, error) => {
        if (error) {
          useAuthStore.getState().markSessionReady();
          return;
        }
        // Finish remote restore (no-op for local). Mark ready either way.
        void (async () => {
          const provider = getAuthProvider();
          if (provider.restoreSession) {
            await useAuthStore.getState().restoreSession();
          } else {
            state?.markSessionReady?.() ?? useAuthStore.getState().markSessionReady();
          }
        })();
      },
    },
  ),
);

export { DEMO_LOGIN };
