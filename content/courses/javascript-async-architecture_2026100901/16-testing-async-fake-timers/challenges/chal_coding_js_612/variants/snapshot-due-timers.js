// Wrong variant: tick() takes a snapshot of the timers due at the start, so timers
// scheduled by callbacks (and the next run of an interval) wait for the next tick.
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
  const byDue = (a, b) => a.at - b.at || a.id - b.id;
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
      const due = [...timers.values()].filter((t) => t.at <= end).sort(byDue);
      for (const timer of due) if (timers.has(timer.id)) fire(timer);
      current = end;
    },
    runAll(limit = 1000) {
      let fired = 0;
      while (timers.size > 0) {
        if (fired >= limit) throw new Error("too many timers");
        fire([...timers.values()].sort(byDue)[0]);
        fired++;
      }
      return fired;
    },
  };
}
