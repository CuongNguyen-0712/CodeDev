// Wrong variant: moves now() to the end of the tick before running callbacks (like node:test's
// mock timers), so callbacks see the wrong time and timers they schedule land too late.
function createFakeClock(startMs = 0) {
  let now = startMs;
  let nextId = 1;
  const pending = new Map();

  return {
    now() {
      return now;
    },
    setTimeout(fn, ms = 0) {
      const id = nextId++;
      pending.set(id, { id, due: now + ms, fn });
      return id;
    },
    clearTimeout(id) {
      pending.delete(id);
    },
    tick(ms) {
      now += ms;
      for (;;) {
        let next = null;
        for (const timer of pending.values()) {
          if (timer.due > now) continue;
          if (!next || timer.due < next.due || (timer.due === next.due && timer.id < next.id)) next = timer;
        }
        if (!next) break;
        pending.delete(next.id);
        next.fn();
      }
    },
  };
}
