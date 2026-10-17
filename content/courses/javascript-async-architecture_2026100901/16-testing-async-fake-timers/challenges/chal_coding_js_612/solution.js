/**
 * Reference solution (never shipped to learners).
 */
function createFakeClock(startTime = 0) {
  let current = startTime;
  let nextId = 1;
  const timers = new Map();

  function schedule(fn, ms, repeat) {
    const delay = Math.max(0, Number(ms) || 0);
    const every = repeat ? Math.max(1, delay) : 0;
    const id = nextId++;
    timers.set(id, { id, at: current + (repeat ? every : delay), fn, every });
    return id;
  }

  // Earliest due timer at or before `until`; ties go to the lower (older) id.
  function nextDue(until) {
    let best = null;
    for (const timer of timers.values()) {
      if (timer.at > until) continue;
      if (!best || timer.at < best.at || (timer.at === best.at && timer.id < best.id)) best = timer;
    }
    return best;
  }

  function fire(timer) {
    current = timer.at;
    // Re-arm (or remove) before calling, so the callback can clear itself.
    if (timer.every) timer.at += timer.every;
    else timers.delete(timer.id);
    timer.fn();
  }

  const clear = (id) => { timers.delete(id); };

  return {
    now: () => current,
    setTimeout: (fn, ms) => schedule(fn, ms, false),
    setInterval: (fn, ms) => schedule(fn, ms, true),
    clearTimeout: clear,
    clearInterval: clear,

    tick(ms) {
      const end = current + Math.max(0, Number(ms) || 0);
      let timer;
      while ((timer = nextDue(end))) fire(timer);
      current = end;
    },

    runAll(limit = 1000) {
      let fired = 0;
      while (timers.size > 0) {
        if (fired >= limit) {
          throw new Error(`runAll: ${timers.size} timer(s) still pending after ${limit} callbacks - is an interval never cleared?`);
        }
        fire(nextDue(Infinity));
        fired++;
      }
      return fired;
    },
  };
}
