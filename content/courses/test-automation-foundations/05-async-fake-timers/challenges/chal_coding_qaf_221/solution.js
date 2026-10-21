/**
 * Reference solution (never shipped to learners).
 */
function createFakeClock(startMs = 0) {
  let now = startMs;
  let nextId = 1;
  const pending = new Map(); // id -> { id, due, fn }

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
      const end = now + ms;
      for (;;) {
        // The earliest timer due by `end`; on a tie, the one scheduled first (lowest id).
        let next = null;
        for (const timer of pending.values()) {
          if (timer.due > end) continue;
          if (!next || timer.due < next.due || (timer.due === next.due && timer.id < next.id)) next = timer;
        }
        if (!next) break;
        pending.delete(next.id);
        now = next.due; // the callback sees its own due time
        next.fn();      // it may schedule or clear timers; the loop looks again
      }
      now = end;
    },
  };
}
