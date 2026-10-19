// Wrong variant: "limits" promises instead of tasks. items.map(task) starts every upload at
// once; the pool only limits how many of the already-running promises are awaited.
function mapWithConcurrency(items, limit, task, options = {}) {
  const stopOnError = options.stopOnError !== false;
  const promises = items.map((item, index) => new Promise((res) => res(task(item, index))));
  promises.forEach((p) => p.catch(() => {})); // "silence the warnings"
  return new Promise((resolve, reject) => {
    const results = new Array(items.length);
    let next = 0, running = 0, done = 0, failed = false;
    if (items.length === 0) return resolve(results);
    function startMore() {
      while (!failed && running < limit && next < items.length) {
        const index = next++;
        running++;
        promises[index].then(
          (value) => { results[index] = stopOnError ? value : { status: "fulfilled", value }; },
          (reason) => {
            if (stopOnError) { if (!failed) reject(reason); failed = true; }
            else results[index] = { status: "rejected", reason };
          },
        ).then(() => {
          running--; done++;
          if (failed) return;
          if (done === items.length) resolve(results); else startMore();
        });
      }
    }
    startMore();
  });
}
