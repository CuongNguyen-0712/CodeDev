// Wrong variant: fires due timers in creation order instead of due-time order.
function createFakeClock(startTime = 0) {
  let current = startTime;
  let nextId = 1;
  const timers = new Map();
  const schedule = (fn, ms, repeat) => {
    const delay = Math.max(0, Number(ms) || 0);
    const id = nextId++;
    timers.set(id, { id, at: current + delay, fn, every: repeat ? Math.max(1, delay) : 0 });
    return id;
  };
  return {
    now: () => current,
    setTimeout: (fn, ms) => schedule(fn, ms, false),
    setInterval: (fn, ms) => schedule(fn, ms, true),
    clearTimeout: (id) => timers.delete(id),
    clearInterval: (id) => timers.delete(id),
    tick(ms) {
      const end = current + ms;
      let firedOne = true;
      while (firedOne) {
        firedOne = false;
        for (const timer of timers.values()) {
          if (timer.at > end) continue;
          current = timer.at;
          if (timer.every) timer.at += timer.every; else timers.delete(timer.id);
          timer.fn();
          firedOne = true;
          break;
        }
      }
      current = end;
    },
    runAll(limit = 1000) {
      let fired = 0;
      while (timers.size > 0) {
        if (fired >= limit) throw new Error("too many timers");
        const timer = timers.values().next().value;
        current = timer.at;
        if (timer.every) timer.at += timer.every; else timers.delete(timer.id);
        timer.fn();
        fired++;
      }
      return fired;
    },
  };
}
