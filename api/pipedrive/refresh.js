import { handleRefresh } from '../../server/pipedrive/http.js';

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  await handleRefresh(req, res);
}
