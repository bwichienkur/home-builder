import { handleDashboard } from '../../server/buildertrend/http.js';

export default async function handler(req, res) {
  await handleDashboard(req, res);
}
