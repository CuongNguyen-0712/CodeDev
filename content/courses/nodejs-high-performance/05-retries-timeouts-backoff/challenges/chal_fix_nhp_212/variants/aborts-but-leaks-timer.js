// Wrong variant: aborts on timeout, but the timer is only cleared on success -
// a fast failure (ECONNRESET) still leaves the deadline timer scheduled.
async function callWithTimeout(fn, timeoutMs, clock) {
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = clock.setTimeout(() => {
      controller.abort();
      reject(Object.assign(new Error("ETIMEDOUT"), { code: "ETIMEDOUT" }));
    }, timeoutMs);
  });
  const result = await Promise.race([fn(controller.signal), timeout]);
  clock.clearTimeout(timer);
  return result;
}
