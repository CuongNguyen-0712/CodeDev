// Wrong variant: waits for in-flight requests but has no deadline - one stuck request
// keeps the pod alive until Kubernetes sends SIGKILL.
function createShutdown({ server, db, timeoutMs, timers }) {
  let shuttingDown = null;

  async function run() {
    await new Promise((resolve) => server.close(resolve));
    await db.end();
    return { drained: true };
  }

  return function shutdown() {
    if (!shuttingDown) shuttingDown = run();
    return shuttingDown;
  };
}
