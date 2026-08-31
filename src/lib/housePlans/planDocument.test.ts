import { describe, expect, it } from 'vitest';
import { stillwater183Plan } from './stillwater183Plan';
import { asPlanDocument, planDocumentFloors, planDocumentRooms } from './planDocument';

describe('planDocument v0', () => {
  it('aliases HousePlan as NormalizedPlanDocument', () => {
    const doc = asPlanDocument(stillwater183Plan);
    expect(doc.id).toBe('stillwater-183');
    expect(planDocumentFloors(doc).length).toBeGreaterThan(0);
    expect(planDocumentRooms(doc).length).toBeGreaterThan(0);
  });
});
