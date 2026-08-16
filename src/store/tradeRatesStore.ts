import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** Trade rate book ($ / unit) + job markups for GC estimates. */
export type TradeRates = {
  drywallPerSf: number;
  paintPerSf: number;
  studEach: number;
  platePerFt: number;
  headerEach: number;
  sheathingPerSf: number;
  insulationPerSf: number;
  baseboardPerFt: number;
  flooringPerSf: number;
  slabPerSf: number;
  footingPerFt: number;
  roofPerSf: number;
  doorEach: number;
  windowPerSf: number;
  /** Labor as a fraction of material for construction allowance lines. */
  laborPctOfMaterial: number;
  /** Finish waste (0.1 = 10%). */
  wasteFactor: number;
  /** Sales tax on material+labor (0.07 = 7%). */
  taxPct: number;
  /** Overhead & profit markup on subtotal before tax (0.12 = 12%). */
  markupPct: number;
};

export const DEFAULT_TRADE_RATES: TradeRates = {
  drywallPerSf: 1.85,
  paintPerSf: 0.85,
  studEach: 4.5,
  platePerFt: 1.25,
  headerEach: 45,
  sheathingPerSf: 1.35,
  insulationPerSf: 1.1,
  baseboardPerFt: 2.75,
  flooringPerSf: 4.5,
  slabPerSf: 6.5,
  footingPerFt: 28,
  roofPerSf: 5.5,
  doorEach: 350,
  windowPerSf: 55,
  laborPctOfMaterial: 0.55,
  wasteFactor: 0.1,
  taxPct: 0.07,
  markupPct: 0.12,
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

const PCT_KEYS: (keyof TradeRates)[] = ['laborPctOfMaterial', 'wasteFactor', 'taxPct', 'markupPct'];

export const useTradeRatesStore = create<TradeRatesState>()(
  persist(
    (set) => ({
      ...DEFAULT_TRADE_RATES,
      setRate: (key, value) =>
        set({
          [key]: PCT_KEYS.includes(key) ? clampRate(value, 0, 5) : clampRate(value),
        } as Partial<TradeRatesState>),
      setRates: (next) =>
        set((s) => {
          const out: Partial<TradeRates> = {};
          for (const key of Object.keys(DEFAULT_TRADE_RATES) as (keyof TradeRates)[]) {
            const v = next[key];
            if (v == null) continue;
            out[key] = PCT_KEYS.includes(key) ? clampRate(v, 0, 5) : clampRate(v);
          }
          return { ...s, ...out };
        }),
      resetRates: () => set({ ...DEFAULT_TRADE_RATES }),
    }),
    { name: 'mahnikka-trade-rates-v2' },
  ),
);

export function pickTradeRates(state: TradeRates): TradeRates {
  const out = { ...DEFAULT_TRADE_RATES };
  for (const key of Object.keys(DEFAULT_TRADE_RATES) as (keyof TradeRates)[]) {
    const v = state[key];
    if (typeof v === 'number' && Number.isFinite(v)) out[key] = v;
  }
  return out;
}
