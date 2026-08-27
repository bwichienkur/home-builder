/** Turn API / thrown values into a human-readable error string (never "[object Object]"). */
export function formatUnknownError(value: unknown, fallback: string): string {
  if (value == null || value === '') return fallback;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed && trimmed !== '[object Object]' ? trimmed : fallback;
  }
  if (value instanceof Error) {
    const nested = formatUnknownError(value.message, '');
    return nested || fallback;
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (const key of ['error', 'message', 'detail', 'title', 'description'] as const) {
      if (key in record) {
        const nested = formatUnknownError(record[key], '');
        if (nested) return nested;
      }
    }
    try {
      const json = JSON.stringify(value);
      if (json && json !== '{}' && json !== 'null') return json;
    } catch {
      /* ignore */
    }
  }
  return fallback;
}

export function errorCodeFromUnknown(value: unknown): string | undefined {
  if (value && typeof value === 'object' && 'code' in value) {
    const code = (value as { code?: unknown }).code;
    return typeof code === 'string' ? code : undefined;
  }
  return undefined;
}
