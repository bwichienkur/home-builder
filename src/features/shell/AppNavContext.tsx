import { createContext, useContext, type ReactNode } from 'react';

export type AppNavContextValue = {
  navOpen: boolean;
  docked: boolean;
  extrasTarget: HTMLElement | null;
  setNavOpen: (open: boolean) => void;
  closeNav: () => void;
  toggleNav: () => void;
};

const AppNavContext = createContext<AppNavContextValue | null>(null);

export function AppNavProvider({
  value,
  children,
}: {
  value: AppNavContextValue;
  children: ReactNode;
}) {
  return <AppNavContext.Provider value={value}>{children}</AppNavContext.Provider>;
}

export function useAppNav(): AppNavContextValue {
  const ctx = useContext(AppNavContext);
  if (!ctx) {
    throw new Error('useAppNav must be used within AppShell');
  }
  return ctx;
}
