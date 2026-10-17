// Wrong variant: correct order, but the deadline timer is never cleared. It fires after the
// shutdown finished and keeps the process (and its event loop) alive until then.
function createShutdown({ server, db, timeoutMs, timers }) {
  let shuttingDown = null;

  async function run() {
    let timedOut = false;
    timers.setTimeout(() => {
      timedOut = true;
      server.closeAllConnections();
    }, timeoutMs);

    await new Promise((resolve) => server.close(resolve));
    await db.end();
    return { drained: !timedOut };
  }

  return function shutdown() {
    if (!shuttingDown) shuttingDown = run();
    return shuttingDown;
  };
}
