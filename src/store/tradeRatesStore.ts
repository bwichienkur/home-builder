import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** Soft trade rates used when catalog cost/labor is missing ($ / unit). */
export type TradeRates = {
  drywallPerSf: number;
  paintPerSf: number;
  studEach: number;
  sheathingPerSf: number;
  baseboardPerFt: number;
  /** Labor as a fraction of material for construction allowance lines. */
  laborPctOfMaterial: number;
};

export const DEFAULT_TRADE_RATES: TradeRates = {
  drywallPerSf: 1.85,
  paintPerSf: 0.85,
  studEach: 4.5,
  sheathingPerSf: 1.35,
  baseboardPerFt: 2.75,
  laborPctOfMaterial: 0.55,
};

type TradeRatesState = TradeRates & {
  setRate: <K extends keyof TradeRates>(key: K, value: number) => void;
  setRates: (next: Partial<TradeRates>) => void;
  resetRates: () => void;
};

function clampRate(value: number, min = 0, max = 1_000_000) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export const useTradeRatesStore = create<TradeRatesState>()(
  persist(
    (set) => ({
      ...DEFAULT_TRADE_RATES,
      setRate: (key, value) =>
        set({
          [key]:
            key === 'laborPctOfMaterial'
              ? clampRate(value, 0, 5)
              : clampRate(value),
        } as Partial<TradeRatesState>),
      setRates: (next) =>
        set((s) => ({
          drywallPerSf: next.drywallPerSf != null ? clampRate(next.drywallPerSf) : s.drywallPerSf,
          paintPerSf: next.paintPerSf != null ? clampRate(next.paintPerSf) : s.paintPerSf,
          studEach: next.studEach != null ? clampRate(next.studEach) : s.studEach,
          sheathingPerSf: next.sheathingPerSf != null ? clampRate(next.sheathingPerSf) : s.sheathingPerSf,
          baseboardPerFt: next.baseboardPerFt != null ? clampRate(next.baseboardPerFt) : s.baseboardPerFt,
          laborPctOfMaterial:
            next.laborPctOfMaterial != null ? clampRate(next.laborPctOfMaterial, 0, 5) : s.laborPctOfMaterial,
        })),
      resetRates: () => set({ ...DEFAULT_TRADE_RATES }),
    }),
    { name: 'mahnikka-trade-rates-v1' },
  ),
);
