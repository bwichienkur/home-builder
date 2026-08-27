import { handleRefresh } from '../../server/buildertrend/http.js';

export const config = { maxDuration: 300 };

export default async function handler(req, res) {
  await handleRefresh(req, res);
}
