// @piece attempt: Load one source, with its own timeout
function attempt(source) {
  const call = new Promise((resolve) => resolve(source.load()));
  if (typeof source.timeoutMs !== "number") return call;

  const timeout = new Promise((_, reject) => {
    timers.setTimeout(() => reject(new Error("timeout")), source.timeoutMs);
  });
  return Promise.race([call, timeout]);
}
