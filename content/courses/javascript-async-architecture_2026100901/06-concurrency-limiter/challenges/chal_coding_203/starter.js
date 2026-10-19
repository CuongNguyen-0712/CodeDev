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

    // TODO: start up to `limit` tasks, start the next item whenever one settles,
    //       store each result at its index and apply the error policy.
  });
}
