/**
 * Runs `task(item, index)` for every item with at most `limit` tasks in flight at any moment -
 * a worker pool for promises.
 *
 * Rules:
 *   - Start tasks in input order. Whenever a task settles, start the next waiting item right away
 *     (a pool, not fixed batches): one slow task must not hold back the other slots.
 *   - Never call task() for an item before a slot is free, and never have more than `limit` running.
 *   - Resolve with the results in INPUT order, not completion order. An empty list resolves with [].
 *   - Error policy, options.stopOnError:
 *       true (default): reject with the first error as soon as it happens and start no further
 *                       tasks. Tasks already running are left to finish; their results are ignored.
 *       false:          never reject. Resolve with one entry per item, like Promise.allSettled:
 *                       { status: "fulfilled", value } or { status: "rejected", reason }.
 *   - A task that throws synchronously counts as a rejected task.
 *
 * @template T, R
 * @param {T[]} items
 * @param {number} limit                       maximum number of tasks in flight (>= 1)
 * @param {(item: T, index: number) => Promise<R>} task
 * @param {{ stopOnError?: boolean }} [options]
 * @returns {Promise<R[] | ({ status: "fulfilled", value: R } | { status: "rejected", reason: any })[]>}
 */
function mapWithConcurrency(items, limit, task, options = {}) {
  const stopOnError = options.stopOnError !== false;

  return new Promise((resolve, reject) => {
    const results = new Array(items.length);

    // @piece counters: Track what is running, finished and failed
    let nextIndex = 0;
    let running = 0;
    let finished = 0;
    let failed = false;

    if (items.length === 0) {
      resolve(results);
      return;
    }
    // @end

    function startMore() {
      while (!failed && running < limit && nextIndex < items.length) {
        const index = nextIndex++;
        running += 1;
        // @piece run-task: Run one task and record its outcome
        new Promise((res) => res(task(items[index], index)))
          .then(
            (value) => {
              results[index] = stopOnError ? value : { status: "fulfilled", value };
            },
            (reason) => {
              if (stopOnError) {
                if (!failed) reject(reason);
                failed = true;
              } else {
                results[index] = { status: "rejected", reason };
              }
            },
          )
        // @end
        // @piece next-item: Free the slot, then finish or start the next item
          .then(() => {
            running -= 1;
            finished += 1;
            if (failed) return;
            if (finished === items.length) resolve(results);
            else startMore();
          });
        // @end
      }
    }

    startMore();
  });
}
