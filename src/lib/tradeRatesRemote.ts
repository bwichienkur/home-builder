import { apiBaseUrl, apiHeaders, isCloudPersistHttp } from '../platform/config';
import type { TradeRates } from '../../store/tradeRatesStore';

export function isTradeRatesHttp(): boolean {
  return isCloudPersistHttp();
}

export async function pullTradeRatesFromServer(): Promise<{ rates: TradeRates; empty: boolean } | null> {
  if (!isTradeRatesHttp()) return null;
  const res = await fetch(`${apiBaseUrl()}/api/trade-rates`, { headers: apiHeaders() });
  if (!res.ok) throw new Error(`Trade rates load failed (${res.status})`);
  const body = (await res.json()) as { rates?: TradeRates; empty?: boolean };
  if (!body.rates || typeof body.rates !== 'object') return null;
  return { rates: body.rates, empty: Boolean(body.empty) };
}

export async function pushTradeRatesToServer(rates: TradeRates): Promise<void> {
  if (!isTradeRatesHttp()) return;
  const res = await fetch(`${apiBaseUrl()}/api/trade-rates`, {
    method: 'PUT',
    headers: apiHeaders(),
    body: JSON.stringify({ rates }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Trade rates save failed (${res.status})`);
  }
}
