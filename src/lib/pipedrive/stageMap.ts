/** Olsen Custom Homes — Sales pipeline id in Pipedrive. */
export const SALES_PIPELINE_ID = 1;

/**
 * Sales pipeline stage → owner-dashboard funnel bucket.
 * Stages: First Contact, Qualified, Homesite Secured, Meet with Eric,
 * Pricing Proposal, Under Negotiation, Contract Sent.
 */
export const STAGE_TO_FUNNEL: Record<number, 'lead' | 'proposal' | 'pre-contract' | 'contract'> = {
  1: 'lead', // First Contact (10%)
  2: 'lead', // Qualified (25%)
  5: 'proposal', // Pricing Proposal (70%)
  4: 'pre-contract', // Homesite Secured (40%)
  3: 'pre-contract', // Meet with Eric (55%)
  17: 'pre-contract', // Under Negotiation (85%)
  6: 'contract', // Contract Sent (100%)
};
