// Wrong variant: the deadline timer is cleared, but the request is never aborted -
// a timed-out call keeps its socket busy until the slow server finally answers.
async function callWithTimeout(fn, timeoutMs, clock) {
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = clock.setTimeout(() => {
      reject(Object.assign(new Error("ETIMEDOUT"), { code: "ETIMEDOUT" }));
    }, timeoutMs);
  });
  try {
    return await Promise.race([fn(controller.signal), timeout]);
  } finally {
    clock.clearTimeout(timer);
  }
}
