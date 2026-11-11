/**
 * Internal / demo / master Buildertrend jobs omitted from every Owner Dashboard
 * KPI, chart, and project list (and from daily-pull rough metrics).
 */

const EXCLUDED_DASHBOARD_JOB_NAMES = new Set(
  [
    'Buildertrend Provided New Home',
    'Buildertrend Provided Onboarding Job',
    'Buildertrend Provided Production Schedule',
    'Digital Showroom',
    'General',
    'OCH Master 2026',
  ].map((name) => name.toLowerCase()),
);

const TEST_JOB = /tate\s+test\s+job/i;

/**
 * @param {string | null | undefined} name
 * @returns {boolean}
 */
export function isExcludedDashboardJobName(name) {
  const normalized = String(name ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
  if (!normalized) return false;
  if (TEST_JOB.test(normalized)) return true;
  if (/template/i.test(normalized)) return true;
  return EXCLUDED_DASHBOARD_JOB_NAMES.has(normalized);
}
