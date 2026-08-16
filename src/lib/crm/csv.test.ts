import { describe, expect, it } from 'vitest';
import { csvHeaders, parseCsv, toCsv } from './csv';

describe('crm csv', () => {
  it('round-trips quoted commas', () => {
    const raw = toCsv([
      ['name', 'notes'],
      ['Ada', 'Hello, world'],
    ]);
    const rows = parseCsv(raw);
    expect(rows[1]).toEqual(['Ada', 'Hello, world']);
  });

  it('builds client headers with custom fields', () => {
    const headers = csvHeaders('client', [
      {
        id: '1',
        entity: 'client',
        key: 'lead_source',
        label: 'Lead source',
        type: 'text',
        required: false,
        options: [],
        order: 0,
        archived: false,
      },
    ]);
    expect(headers).toContain('name');
    expect(headers).toContain('custom.lead_source');
  });
});
