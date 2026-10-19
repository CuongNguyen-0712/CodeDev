// Wrong variant: a correct pool, but results are pushed in completion order -
// result[i] no longer belongs to items[i].
function mapWithConcurrency(items, limit, task, options = {}) {
  const stopOnError = options.stopOnError !== false;
  return new Promise((resolve, reject) => {
    const results = [];
    let next = 0, running = 0, failed = false;
    if (items.length === 0) return resolve(results);
    function startMore() {
      while (!failed && running < limit && next < items.length) {
        const index = next++;
        running++;
        new Promise((res) => res(task(items[index], index))).then(
          (value) => { results.push(stopOnError ? value : { status: "fulfilled", value }); },
          (reason) => {
            if (stopOnError) { if (!failed) reject(reason); failed = true; }
            else results.push({ status: "rejected", reason });
          },
        ).then(() => {
          running--;
          if (failed) return;
          if (results.length === items.length) resolve(results);
          else startMore();
        });
      }
    }
    startMore();
  });
}
