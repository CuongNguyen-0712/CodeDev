// @piece deadline: Start the deadline timer
let timer;
const timeout = new Promise((_, reject) => {
  timer = clock.setTimeout(() => {
    reject(Object.assign(new Error("ETIMEDOUT"), { code: "ETIMEDOUT" }));
  }, timeoutMs);
});
