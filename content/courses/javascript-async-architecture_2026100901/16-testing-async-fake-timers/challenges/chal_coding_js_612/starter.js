/**
 * A tiny fake clock for deterministic tests - the core of what vi.useFakeTimers()
 * and @sinonjs/fake-timers do. Nothing here may use the real setTimeout.
 *
 * Requirements:
 *   - now() returns the fake time in ms (starts at startTime).
 *   - setTimeout(fn, ms) / setInterval(fn, ms) return a unique numeric id.
 *     A missing or negative delay counts as 0; an interval shorter than 1 ms repeats every 1 ms.
 *   - clearTimeout(id) / clearInterval(id) cancel the timer (either works for any id,
 *     unknown ids are ignored). An interval may clear itself from inside its callback.
 *   - tick(ms) moves time forward by ms and fires every timer that becomes due, in order of
 *     due time. Timers due at the same time fire in the order they were created (an interval
 *     keeps its original id when it repeats). While a callback runs, now() equals its due time.
 *     Timers scheduled from inside a callback that fall inside the window fire in the same tick.
 *     After tick(ms), now() is exactly the old now() + ms.
 *   - runAll(limit = 1000) fires timers (jumping time forward) until none are left and returns
 *     how many callbacks ran. It fires at most `limit` callbacks: if timers are still pending
 *     after that, it throws an Error (an interval that is never cleared would loop forever).
 *
 * @typedef {{ id: number, at: number, fn: () => void, every: number }} Timer
 *
 * @typedef {object} FakeClock
 * @property {() => number} now
 * @property {(fn: () => void, ms?: number) => number} setTimeout
 * @property {(fn: () => void, ms?: number) => number} setInterval
 * @property {(id: number) => void} clearTimeout
 * @property {(id: number) => void} clearInterval
 * @property {(ms: number) => void} tick
 * @property {(limit?: number) => number} runAll
 *
 * @param {number} [startTime=0]
 * @returns {FakeClock}
 */
function createFakeClock(startTime = 0) {
  let current = startTime;
  let nextId = 1;
  /** @type {Map<number, Timer>} */
  const timers = new Map();

  return {
    now: () => current,

    setTimeout(fn, ms) {
      // TODO: register a one-shot timer due at current + delay, return its id
    },

    setInterval(fn, ms) {
      // TODO: register a repeating timer
    },

    clearTimeout(id) {
      timers.delete(id);
    },

    clearInterval(id) {
      timers.delete(id);
    },

    tick(ms) {
      // TODO: fire every timer due up to current + ms (earliest first, ties by id),
      // including timers scheduled by the callbacks themselves, then set current = old + ms
    },

    runAll(limit = 1000) {
      // TODO: fire everything that is pending, guarded by `limit`
      return 0;
    },
  };
}
