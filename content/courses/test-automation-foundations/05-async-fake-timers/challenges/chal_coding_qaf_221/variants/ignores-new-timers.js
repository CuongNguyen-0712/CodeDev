// Wrong variant: picks the due timers once, at the start of tick(), so a timer scheduled by a
// callback never runs in the same tick (and a timer cleared by an earlier callback still runs).
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
      const end = now + ms;
      const due = [...pending.values()]
        .filter((timer) => timer.due <= end)
        .sort((a, b) => a.due - b.due || a.id - b.id);
      for (const timer of due) {
        pending.delete(timer.id);
        now = timer.due;
        timer.fn();
      }
      now = end;
    },
  };
}
