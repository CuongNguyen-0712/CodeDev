// Wrong variant: the checkpoint only runs the microtasks that were queued when it started.
// Microtasks queued by microtasks wait until after the NEXT task - a timer can sneak in between.
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
    const batch = microtasks.splice(0, microtasks.length);
    for (const cb of batch) runGuarded(cb, onError);
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
