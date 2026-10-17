// Wrong variant: runAll() quietly stops at the limit instead of throwing, so a test with a
// runaway interval "passes" while the code under test never settles.
function createFakeClock(startTime = 0) {
  let current = startTime;
  let nextId = 1;
  const timers = new Map();
  const schedule = (fn, ms, repeat) => {
    const delay = Math.max(0, Number(ms) || 0);
    const every = repeat ? Math.max(1, delay) : 0;
    const id = nextId++;
    timers.set(id, { id, at: current + (repeat ? every : delay), fn, every });
    return id;
  };
  const nextDue = (until) => {
    let best = null;
    for (const t of timers.values()) {
      if (t.at <= until && (!best || t.at < best.at || (t.at === best.at && t.id < best.id))) best = t;
    }
    return best;
  };
  const fire = (timer) => {
    current = timer.at;
    if (timer.every) timer.at += timer.every; else timers.delete(timer.id);
    timer.fn();
  };
  return {
    now: () => current,
    setTimeout: (fn, ms) => schedule(fn, ms, false),
    setInterval: (fn, ms) => schedule(fn, ms, true),
    clearTimeout: (id) => timers.delete(id),
    clearInterval: (id) => timers.delete(id),
    tick(ms) {
      const end = current + ms;
      let timer;
      while ((timer = nextDue(end))) fire(timer);
      current = end;
    },
    runAll(limit = 1000) {
      let fired = 0;
      while (timers.size > 0 && fired < limit) {
        fire(nextDue(Infinity));
        fired++;
      }
      return fired;
    },
  };
}
