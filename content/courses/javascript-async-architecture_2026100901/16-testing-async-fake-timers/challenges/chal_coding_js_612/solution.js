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

  // @piece schedule: Register a timer and return its id
  function schedule(fn, ms, repeat) {
    const delay = Math.max(0, Number(ms) || 0);
    const every = repeat ? Math.max(1, delay) : 0;
    const id = nextId++;
    timers.set(id, { id, at: current + (repeat ? every : delay), fn, every });
    return id;
  }
  // @end

  // @piece next-due: Pick the next timer that is due
  function nextDue(until) {
    let best = null;
    for (const timer of timers.values()) {
      if (timer.at > until) continue;
      if (!best || timer.at < best.at || (timer.at === best.at && timer.id < best.id)) best = timer;
    }
    return best;
  }
  // @end

  // @piece fire: Fire one timer
  function fire(timer) {
    current = timer.at;
    if (timer.every) timer.at += timer.every;
    else timers.delete(timer.id);
    timer.fn();
  }
  // @end

  return {
    now: () => current,

    setTimeout(fn, ms) {
      // @piece register-timeout: Register a one-shot timer
      return schedule(fn, ms, false);
      // @end
    },

    setInterval(fn, ms) {
      // @piece register-interval: Register a repeating timer
      return schedule(fn, ms, true);
      // @end
    },

    clearTimeout(id) {
      timers.delete(id);
    },

    clearInterval(id) {
      timers.delete(id);
    },

    tick(ms) {
      // @piece tick: Advance the clock and fire what is due
      const end = current + Math.max(0, Number(ms) || 0);
      let timer;
      while ((timer = nextDue(end))) fire(timer);
      current = end;
      // @end
    },

    runAll(limit = 1000) {
      // @piece run-all: Fire everything pending, within the limit
      let fired = 0;
      while (timers.size > 0) {
        if (fired >= limit) {
          throw new Error(`runAll: ${timers.size} timer(s) still pending after ${limit} callbacks - is an interval never cleared?`);
        }
        fire(nextDue(Infinity));
        fired++;
      }
      return fired;
      // @end
    },
  };
}
