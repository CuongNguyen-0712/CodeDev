/**
 * Reference solution (never shipped to learners).
 */
function createEventLoop() {
  let clock = 0;
  let seq = 0;
  const timers = new Map(); // id -> { id, due, cb }
  const microtasks = [];

  function runGuarded(cb, onError) {
    try {
      cb();
    } catch (error) {
      onError(error);
    }
  }

  function checkpoint(onError) {
    // Microtasks queued while draining are appended and run in the same checkpoint.
    while (microtasks.length > 0) runGuarded(microtasks.shift(), onError);
  }

  return {
    now() {
      return clock;
    },
    setTimeout(cb, ms) {
      const id = ++seq;
      timers.set(id, { id, due: clock + Math.max(0, Number(ms) || 0), cb });
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
    queueMicrotask(cb) {
      microtasks.push(cb);
    },
    run(main, onError) {
      runGuarded(main, onError);
      checkpoint(onError);

      while (timers.size > 0) {
        let next = null;
        for (const timer of timers.values()) {
          if (!next || timer.due < next.due || (timer.due === next.due && timer.id < next.id)) next = timer;
        }
        timers.delete(next.id);
        clock = Math.max(clock, next.due);
        runGuarded(next.cb, onError);
        checkpoint(onError);
      }
    },
  };
}
