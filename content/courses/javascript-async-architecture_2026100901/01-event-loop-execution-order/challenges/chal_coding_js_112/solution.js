/**
 * A tiny, deterministic model of the browser event loop: one task at a time, a microtask
 * checkpoint after every task, and timers ordered on a virtual clock.
 *
 * createEventLoop() returns:
 *   - now()                  current virtual time in ms (starts at 0, never goes backwards)
 *   - setTimeout(cb, ms)     schedule cb as a TASK due at now() + ms (negative / missing ms = 0);
 *                            returns a timer id
 *   - clearTimeout(id)       cancel a pending timer (unknown or already-run ids are ignored)
 *   - queueMicrotask(cb)     queue cb as a MICROTASK
 *   - run(main, onError)     run the program until there is nothing left to do:
 *       1. run main() as the first task;
 *       2. after EVERY task, run the microtask checkpoint: run microtasks in FIFO order until
 *          the microtask queue is empty - including microtasks queued by other microtasks;
 *       3. then take the next timer: the one with the earliest due time, and for equal due
 *          times the one scheduled first. Move the clock to its due time and run it as one
 *          task (followed by a checkpoint, as in step 2). Repeat until no timer is left.
 *     If a task or a microtask throws, call onError(error) and carry on: the rest of the
 *     checkpoint and all later tasks still run. run() itself must not throw.
 *
 * Do not use the real setTimeout, queueMicrotask or promises to order callbacks - the point is
 * to implement the ordering yourself.
 *
 * @returns {{
 *   now(): number,
 *   setTimeout(cb: () => void, ms?: number): number,
 *   clearTimeout(id: number): void,
 *   queueMicrotask(cb: () => void): void,
 *   run(main: () => void, onError: (error: unknown) => void): void,
 * }}
 */
function createEventLoop() {
  let clock = 0;

  // @piece queues: Timer and microtask queues
  let seq = 0;
  const timers = new Map(); // id -> { id, due, cb }
  const microtasks = [];
  // @end

  // @piece checkpoint: Run callbacks safely and drain the microtasks
  function runGuarded(cb, onError) {
    try {
      cb();
    } catch (error) {
      onError(error);
    }
  }

  function checkpoint(onError) {
    while (microtasks.length > 0) runGuarded(microtasks.shift(), onError);
  }
  // @end

  return {
    now() {
      return clock;
    },
    setTimeout(cb, ms) {
      // @piece schedule: Schedule the callback as a timer task
      const id = ++seq;
      timers.set(id, { id, due: clock + Math.max(0, Number(ms) || 0), cb });
      return id;
      // @end
    },
    clearTimeout(id) {
      // @piece cancel: Cancel a pending timer
      timers.delete(id);
      // @end
    },
    queueMicrotask(cb) {
      // @piece enqueue: Queue a microtask
      microtasks.push(cb);
      // @end
    },
    run(main, onError) {
      // @piece run-loop: Run main, then every timer in due order
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
      // @end
    },
  };
}
