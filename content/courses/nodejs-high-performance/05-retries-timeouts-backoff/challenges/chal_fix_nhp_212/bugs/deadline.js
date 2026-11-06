// @piece deadline: Start the deadline timer
const timeout = new Promise((_, reject) => {
  clock.setTimeout(() => {
    reject(Object.assign(new Error("ETIMEDOUT"), { code: "ETIMEDOUT" }));
  }, timeoutMs);
});
