// @piece run-task: Run one task and record its outcome
new Promise((res) => res(task(items[index], index)))
  .then(
    (value) => {
      results[finished] = stopOnError ? value : { status: "fulfilled", value };
    },
    (reason) => {
      if (stopOnError) {
        if (!failed) reject(reason);
        failed = true;
      } else {
        results[finished] = { status: "rejected", reason };
      }
    },
  )
