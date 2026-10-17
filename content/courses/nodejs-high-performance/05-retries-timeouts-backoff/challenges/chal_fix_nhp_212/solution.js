/**
 * Reference solution (never shipped to learners).
 * Abort the request when the deadline hits, and always clear the deadline timer once the
 * race is decided - whichever side won.
 */
async function callWithTimeout(fn, timeoutMs, clock) {
  const controller = new AbortController();
  let timer;

  const timeout = new Promise((_, reject) => {
    timer = clock.setTimeout(() => {
      controller.abort();
      reject(Object.assign(new Error("ETIMEDOUT"), { code: "ETIMEDOUT" }));
    }, timeoutMs);
  });

  try {
    return await Promise.race([fn(controller.signal), timeout]);
  } finally {
    clock.clearTimeout(timer);
  }
}
