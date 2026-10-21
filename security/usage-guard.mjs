/**
 * No-user-identifier, process-local simulation of a global request/spend cap.
 * This is an offline planning helper, NOT a production distributed limiter.
 * Defaults are zero: without explicit configuration nothing is billable.
 */
export function createUsageGuard({ hourlyRequestCap = 0, dailyBudgetCents = 0, now = () => Date.now() } = {}) {
  if (![hourlyRequestCap, dailyBudgetCents].every(v => Number.isSafeInteger(v) && v >= 0)) throw new TypeError('Invalid limits');
  let hour = null, day = null, count = 0, reserved = 0;
  function reserve(estimatedMaximumCents) {
    // Synchronous, fail-closed reservation; no personal identifiers or content.
    if (!Number.isSafeInteger(estimatedMaximumCents) || estimatedMaximumCents <= 0) return { allowed: false, reason: 'invalid-estimate' };
    const time = now();
    if (!Number.isFinite(time)) return { allowed: false, reason: 'clock-unavailable' };
    const currentHour = Math.floor(time / 3_600_000);
    const currentDay = Math.floor(time / 86_400_000);
    if (hour !== currentHour) { hour = currentHour; count = 0; }
    if (day !== currentDay) { day = currentDay; reserved = 0; }
    if (count >= hourlyRequestCap) return { allowed: false, reason: 'hourly-limit' };
    if (estimatedMaximumCents > dailyBudgetCents - reserved) return { allowed: false, reason: 'daily-spending-cap' };
    count++;
    reserved += estimatedMaximumCents;
    return { allowed: true, reason: 'offline-simulation-only' };
  }
  function usageSnapshot() { return Object.freeze({ count, reservedCents: reserved }); }
  return Object.freeze({ reserve, usageSnapshot });
}
