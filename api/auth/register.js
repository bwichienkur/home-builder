import { runAuthPath } from '../../server/authVercelHandler.js';

export default function handler(req, res) {
  return runAuthPath(req, res, '/api/auth/register');
}
