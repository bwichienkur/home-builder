/**
 * Extract Owner Dashboard KPI numbers from stored live pulls for daily history.
 * Mirrors mapReports contract resolution enough that Job Info–priced opens
 * (Graham / Olmstead / Peters) count toward Total WIP — not only WIP-report rows.
 */

function asRows(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.rowData)) return payload.rowData;
  if (Array.isArray(payload?.data?.rowData)) return payload.data.rowData;
  if (Array.isArray(payload?.data?.jobs)) return payload.data.jobs;
  if (Array.isArray(payload?.jobs)) return payload.jobs;
  return [];
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function isOpenStatus(status) {
  const s = String(status ?? '').toLowerCase();
  return !s || s.includes('open') || s === '0' || s === '1';
}

function jobIdOf(row) {
  return num(row?.jobID ?? row?.jobId ?? row?.id);
}

function revisedPriceOf(row) {
  return num(
    row?.revisedClientPrice ??
      row?.totalRevisedPrice ??
      row?.revisedPrice ??
      row?.contractPrice ??
      row?.revisedContractPrice ??
      row?.wip,
  );
}

/**
 * @param {unknown} btPayload
 * @param {unknown} pdPayload
 * @returns {Record<string, number>}
 */
export function roughMetricsFromPull(btPayload, pdPayload) {
  const metrics = {};
  try {
    const reports = btPayload?.reports ?? {};
    const wipRows = asRows(reports.wip);
    const profRows = asRows(reports.profitability);
    const pickerRows = asRows(reports.jobs);
    const jobInfo = reports.jobInfoContractByJob ?? {};

    /** @type {Map<number, number>} */
    const priceByJob = new Map();

    for (const row of wipRows) {
      const id = jobIdOf(row);
      const price = revisedPriceOf(row);
      if (id && price > 0) priceByJob.set(id, price);
    }
    for (const row of profRows) {
      const id = jobIdOf(row);
      const price = revisedPriceOf(row);
      if (id && price > 0) priceByJob.set(id, price);
    }
    for (const [idStr, price] of Object.entries(jobInfo)) {
      const id = num(idStr);
      const value = num(price);
      if (id && value > 0 && !priceByJob.has(id)) priceByJob.set(id, value);
    }

    const openIds = new Set();
    for (const row of pickerRows) {
      if (!isOpenStatus(row?.jobStatus ?? row?.status)) continue;
      const id = jobIdOf(row);
      if (id) openIds.add(id);
    }
    // Fall back to WIP open rows when picker is absent.
    if (!openIds.size) {
      for (const row of wipRows) {
        if (!isOpenStatus(row?.jobStatus ?? row?.status)) continue;
        const id = jobIdOf(row);
        if (id) openIds.add(id);
      }
    }
    // Include Job Info keys that look like open pre-budget jobs when picker omitted them.
    if (!openIds.size) {
      for (const idStr of Object.keys(jobInfo)) {
        const id = num(idStr);
        if (id && num(jobInfo[idStr]) > 0) openIds.add(id);
      }
    }

    let wip = 0;
    let active = 0;
    for (const id of openIds) {
      active += 1;
      wip += priceByJob.get(id) ?? 0;
    }
    // If we still have no open ids, sum positive prices (legacy WIP-only path).
    if (!active && priceByJob.size) {
      for (const price of priceByJob.values()) {
        active += 1;
        wip += price;
      }
    }

    let revenue = 0;
    for (const row of wipRows) {
      revenue += num(row?.amountInvoiced ?? row?.revenueToDate);
    }

    if (active) metrics.active = active;
    if (wip) metrics.wip = wip;
    if (revenue) metrics.revenue = revenue;
  } catch {
    /* ignore */
  }

  try {
    const stages = pdPayload?.reports?.pipelineStages || pdPayload?.reports?.stages;
    if (Array.isArray(stages)) {
      let weighted = 0;
      for (const stage of stages) {
        const value = Number(stage?.value ?? stage?.weightedValue ?? 0) || 0;
        const weight = Number(stage?.weight ?? stage?.probability ?? 1) || 1;
        weighted += value * (weight > 1 ? weight / 100 : weight);
      }
      if (weighted) metrics.pipeline = weighted;
    }
  } catch {
    /* ignore */
  }

  return metrics;
}
