/**
 * Build a fake clock: a test double for time that you can pass to code instead of the real
 * Date.now / setTimeout / clearTimeout, and move forward instantly with tick(ms).
 *
 * createFakeClock(startMs = 0) returns an object with four methods:
 *
 *   now()                  the current fake time in ms. Starts at startMs.
 *   setTimeout(fn, ms = 0) schedules fn to run when the clock reaches now() + ms (ms >= 0;
 *                          a missing ms means 0). Returns an id: a number, different for
 *                          every call. Nothing runs until tick() is called.
 *   clearTimeout(id)       cancels that timer if it has not run yet. Ids of timers that already
 *                          ran or were cleared, unknown ids, null and undefined: do nothing.
 *   tick(ms)               moves time forward by ms (ms >= 0) and runs every timer that falls
 *                          due on the way, including one due exactly at the end:
 *     - in order of due time; timers with the same due time run in the order they were scheduled;
 *     - while a callback runs, now() returns THAT timer's due time (not the end of the tick);
 *     - a callback may call setTimeout / clearTimeout. A timer it schedules runs in the same
 *       tick() if it falls due by the end of the tick; a timer it clears does not run;
 *     - after tick(ms) returns, now() is exactly the time before the call + ms.
 *   Everything is synchronous: tick() runs the callbacks itself, no promises, no real timers.
 *
 * Note: node:test's t.mock.timers.tick() moves the clock to the end of the tick BEFORE it runs
 * the callbacks, and does not run timers scheduled during the tick. Your clock must not.
 *
 * Example:
 *   const clock = createFakeClock(1000);
 *   const log = [];
 *   clock.setTimeout(() => {
 *     log.push("a@" + clock.now());                                // "a@1100"
 *     clock.setTimeout(() => log.push("b@" + clock.now()), 50);    // due at 1150
 *   }, 100);
 *   clock.setTimeout(() => log.push("late@" + clock.now()), 900);  // due at 1900
 *   clock.tick(500);
 *   log          // ["a@1100", "b@1150"]
 *   clock.now()  // 1500
 *
 * The grader drives real code with your clock (a debounce, a retry with exponential backoff,
 * a timeout) and also checks the rules above directly.
 *
 * @param {number} [startMs=0]
 * @returns {{ now(): number, setTimeout(fn: Function, ms?: number): number, clearTimeout(id: any): void, tick(ms: number): void }}
 */
function createFakeClock(startMs = 0) {
  let now = startMs;
  let nextId = 1;
  const pending = []; // { id, due, fn }

  return {
    now() {
      return now;
    },
    setTimeout(fn, ms = 0) {
      const id = nextId++;
      pending.push({ id, due: now + ms, fn });
      return id;
    },
    clearTimeout(id) {
      // TODO: cancel the timer with this id (if it is still pending)
    },
    tick(ms) {
      // TODO: run every timer that falls due during this tick, in order, with now() set to
      // each timer's due time while it runs. For now, time only moves.
      now += ms;
    },
  };
}
