// Wrong variant: tick() is right, but clearTimeout() never cancels anything, so a debounce
// fires once per call and a cleared timeout still fires.
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
      if (!pending.has(id)) return;
      // "cancel" by marking it - but the flag is never read
      pending.get(id).cancelled = true;
    },
    tick(ms) {
      const end = now + ms;
      for (;;) {
        let next = null;
        for (const timer of pending.values()) {
          if (timer.due > end) continue;
          if (!next || timer.due < next.due || (timer.due === next.due && timer.id < next.id)) next = timer;
        }
        if (!next) break;
        pending.delete(next.id);
        now = next.due;
        next.fn();
      }
      now = end;
    },
  };
}
