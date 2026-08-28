import { describe, expect, it } from 'vitest';
import { z } from 'zod';

describe('selectionProjectRoutes schema', () => {
  const contractSchema = z.object({
    id: z.string(),
    name: z.string(),
    baseline: z.literal('platinum'),
    includedLevels: z.array(
      z.object({
        pricingCategory: z.string(),
        includedLevel: z.string(),
        label: z.string(),
        priceUnit: z.string(),
      }),
    ),
    verifiedAt: z.string(),
  });

  const createSchema = z.object({
    name: z.string().min(1),
    planRef: z.string().optional(),
    lotRef: z.string().optional(),
    contract: contractSchema,
    sceneProjectId: z.string().uuid().optional().nullable(),
  });

  it('accepts platinum contract payloads', () => {
    const parsed = createSchema.safeParse({
      name: '183 Stillwater',
      planRef: 'Veranda 183',
      contract: {
        id: 'contract-test',
        name: '183 Stillwater COF',
        baseline: 'platinum',
        includedLevels: [
          {
            pricingCategory: 'floor-tile',
            includedLevel: 'Level 3',
            label: 'Floor tile',
            priceUnit: 'sq ft',
          },
        ],
        verifiedAt: '2026-01-01',
      },
    });
    expect(parsed.success).toBe(true);
  });
});
