import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  isTradeRatesHttp,
  pullTradeRatesFromServer,
  pushTradeRatesToServer,
} from '../lib/tradeRatesRemote';

/** Trade rate book ($ / unit) + job markups for GC / bid estimates. */
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
  /** Labor as a fraction of material when crew hours are not used. */
  laborPctOfMaterial: number;
  /** Optional blended crew $/hr for hour-based labor on select lines. */
  laborRatePerHour: number;
  /** Finish waste (0.1 = 10%). */
  wasteFactor: number;
  /** Sales tax on taxable base (0.07 = 7%). */
  taxPct: number;
  /** Overhead & profit markup (0.12 = 12%). */
  markupPct: number;
  /** Design contingency on direct costs (0.05 = 5%). */
  contingencyPct: number;
  /** Escalation on direct + contingency (0.03 = 3%). */
  escalationPct: number;
  /** Performance/payment bond on pre-bond total (0.015 = 1.5%). */
  bondPct: number;
  /** MEP / site unit rates */
  electricalOutletEach: number;
  lightingFixtureEach: number;
  electricalPanelEach: number;
  plumbingFixtureEach: number;
  hvacTonEach: number;
  ductPerFt: number;
  excavationPerCy: number;
  landscapingPerSf: number;
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
  laborRatePerHour: 65,
  wasteFactor: 0.1,
  taxPct: 0.07,
  markupPct: 0.12,
  contingencyPct: 0.05,
  escalationPct: 0.03,
  bondPct: 0.015,
  electricalOutletEach: 85,
  lightingFixtureEach: 120,
  electricalPanelEach: 1800,
  plumbingFixtureEach: 650,
  hvacTonEach: 4200,
  ductPerFt: 18,
  excavationPerCy: 45,
  landscapingPerSf: 4.5,
};

type TradeRatesState = TradeRates & {
  setRate: <K extends keyof TradeRates>(key: K, value: number) => void;
  setRates: (next: Partial<TradeRates>) => void;
  resetRates: () => void;
  hydrateRemote: () => Promise<void>;
};

function clampRate(value: number, min = 0, max = 1_000_000) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

const PCT_KEYS: (keyof TradeRates)[] = [
  'laborPctOfMaterial',
  'wasteFactor',
  'taxPct',
  'markupPct',
  'contingencyPct',
  'escalationPct',
  'bondPct',
];

let pushTimer: ReturnType<typeof setTimeout> | null = null;

function schedulePush() {
  if (!isTradeRatesHttp()) return;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    const rates = pickTradeRates(useTradeRatesStore.getState());
    void pushTradeRatesToServer(rates).catch((err) => console.warn('Trade rates remote save failed', err));
  }, 600);
}

export const useTradeRatesStore = create<TradeRatesState>()(
  persist(
    (set, get) => ({
      ...DEFAULT_TRADE_RATES,
      setRate: (key, value) => {
        set({
          [key]: PCT_KEYS.includes(key) ? clampRate(value, 0, 5) : clampRate(value),
        } as Partial<TradeRatesState>);
        schedulePush();
      },
      setRates: (next) => {
        set((s) => {
          const out: Partial<TradeRates> = {};
          for (const key of Object.keys(DEFAULT_TRADE_RATES) as (keyof TradeRates)[]) {
            const v = next[key];
            if (v == null) continue;
            out[key] = PCT_KEYS.includes(key) ? clampRate(v, 0, 5) : clampRate(v);
          }
          return { ...s, ...out };
        });
        schedulePush();
      },
      resetRates: () => {
        set({ ...DEFAULT_TRADE_RATES });
        schedulePush();
      },
      hydrateRemote: async () => {
        if (!isTradeRatesHttp()) return;
        try {
          const remote = await pullTradeRatesFromServer();
          if (remote?.rates && !remote.empty) {
            set({ ...pickTradeRates(remote.rates) });
            return;
          }
          await pushTradeRatesToServer(pickTradeRates(get()));
        } catch (err) {
          console.warn('Trade rates remote hydrate failed', err);
        }
      },
    }),
    {
      name: 'mahnikka-trade-rates-v3',
      onRehydrateStorage: () => () => {
        if (typeof window !== 'undefined' && isTradeRatesHttp()) {
          void useTradeRatesStore.getState().hydrateRemote();
        }
      },
    },
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

if (typeof window !== 'undefined' && isTradeRatesHttp()) {
  void useTradeRatesStore.getState().hydrateRemote();
}
