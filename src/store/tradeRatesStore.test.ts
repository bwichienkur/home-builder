import { describe, expect, it } from 'vitest';
import { DEFAULT_TRADE_RATES, useTradeRatesStore } from './tradeRatesStore';

describe('tradeRatesStore', () => {
  it('starts from defaults and clamps rates', () => {
    useTradeRatesStore.getState().resetRates();
    expect(useTradeRatesStore.getState().drywallPerSf).toBe(DEFAULT_TRADE_RATES.drywallPerSf);
    useTradeRatesStore.getState().setRate('drywallPerSf', 2.25);
    expect(useTradeRatesStore.getState().drywallPerSf).toBe(2.25);
    useTradeRatesStore.getState().setRate('taxPct', 0.08);
    expect(useTradeRatesStore.getState().taxPct).toBe(0.08);
    useTradeRatesStore.getState().setRate('laborPctOfMaterial', -1);
    expect(useTradeRatesStore.getState().laborPctOfMaterial).toBe(0);
    useTradeRatesStore.getState().resetRates();
  });
});
