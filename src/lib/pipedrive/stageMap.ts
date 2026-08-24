/** Olsen Custom Homes — Sales pipeline id in Pipedrive. */
export const SALES_PIPELINE_ID = 1;

export const PIPEDRIVE_STAGE_KEY_PREFIX = 'pd-';

/** Contract Sent stage in the Sales pipeline. */
export const CONTRACT_SENT_STAGE_ID = 6;

export function pipedriveStageKey(stageId: number) {
  return `${PIPEDRIVE_STAGE_KEY_PREFIX}${stageId}`;
}

export function isPipedriveStageKey(id: string) {
  return id.startsWith(PIPEDRIVE_STAGE_KEY_PREFIX);
}
