/**
 * Reference solution (never shipped to learners).
 */
function mapWithConcurrency(items, limit, task, options = {}) {
  const stopOnError = options.stopOnError !== false;

  return new Promise((resolve, reject) => {
    const results = new Array(items.length);
    let nextIndex = 0;
    let running = 0;
    let finished = 0;
    let failed = false;

    if (items.length === 0) {
      resolve(results);
      return;
    }

    function startMore() {
      while (!failed && running < limit && nextIndex < items.length) {
        const index = nextIndex++;
        running += 1;
        // new Promise(...) turns a synchronous throw into a rejection.
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
          .then(() => {
            running -= 1;
            finished += 1;
            if (failed) return;
            if (finished === items.length) resolve(results);
            else startMore();
          });
      }
    }

    startMore();
  });
}
