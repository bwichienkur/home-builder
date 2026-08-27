/** Tiny health check so we can verify Vercel functions are reachable. */
export const config = { maxDuration: 10 };

export default function handler(_req, res) {
  res.status(200).json({
    ok: true,
    service: 'buildertrend',
    ping: true,
    at: new Date().toISOString(),
  });
}
