// Wrong variant: sleeps for the full timeout on every deploy, then force-closes.
// Requests that finished early do not matter - shutdown always takes timeoutMs and reports a timeout.
function createShutdown({ server, db, timeoutMs, timers }) {
  let shuttingDown = null;

  async function run() {
    server.close();
    await new Promise((resolve) => timers.setTimeout(resolve, timeoutMs));
    server.closeAllConnections();
    await db.end();
    return { drained: false };
  }

  return function shutdown() {
    if (!shuttingDown) shuttingDown = run();
    return shuttingDown;
  };
}
