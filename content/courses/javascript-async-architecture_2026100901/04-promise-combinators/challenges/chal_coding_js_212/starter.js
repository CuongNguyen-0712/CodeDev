/**
 * Loads every data source of the account dashboard at the same time and decides what can be
 * rendered.
 *
 * Each source looks like:
 *   { name: "offers", load: () => Promise<any>, required?: boolean, timeoutMs?: number, fallback?: any }
 *
 * Rules:
 *   - Start every load() immediately - all sources run in parallel.
 *   - A source fails when its promise rejects, when load() throws synchronously, or when it has
 *     not settled after `timeoutMs` (if given). A timed-out source fails with the message "timeout";
 *     a result that arrives after the timeout is ignored.
 *   - Optional source fails: the dashboard still renders. data[name] = source.fallback (or null when
 *     there is no fallback) and errors[name] = the error message.
 *   - Required source fails: reject with new Error(`${name}: ${message}`) as soon as that failure is
 *     known - do not wait for slower sources.
 *   - Otherwise resolve with { data, errors } once every source has succeeded, failed or timed out.
 *     data holds every source by name, errors only the failed ones ({} when nothing failed).
 *   - Clear each timeout timer when its source settles: once the dashboard resolves, none of your
 *     timers may still be pending.
 *
 * Use ONLY the injected timers (the tests control the clock):
 *   timers.setTimeout(callback, ms) -> id, timers.clearTimeout(id), timers.now() -> current time in ms
 *
 * @param {{ name: string, load: () => Promise<any>, required?: boolean, timeoutMs?: number, fallback?: any }[]} sources
 * @param {{ setTimeout(cb: () => void, ms: number): any, clearTimeout(id: any): void, now(): number }} timers
 * @returns {Promise<{ data: Record<string, any>, errors: Record<string, string> }>}
 */
async function loadDashboard(sources, timers) {
  // [ ] Load one source, with its own timeout

  const attempts = sources.map(attempt);

  // [ ] Fail fast when a required source fails

  // [ ] Wait for every source to settle

  const data = {};
  const errors = {};
  // [ ] Fill data and errors from the outcomes
  return { data, errors };
}
