import { handleDashboard } from '../../server/pipedrive/http.js';

export default async function handler(req, res) {
  await handleDashboard(req, res);
}
