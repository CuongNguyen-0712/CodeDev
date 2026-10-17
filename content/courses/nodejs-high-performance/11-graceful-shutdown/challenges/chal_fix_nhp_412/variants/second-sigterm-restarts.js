// Wrong variant: correct sequence, but every SIGTERM starts a new shutdown
// (server.close twice, the pool ended twice).
function createShutdown({ server, db, timeoutMs, timers }) {
  return async function shutdown() {
    let timedOut = false;
    const deadline = timers.setTimeout(() => {
      timedOut = true;
      server.closeAllConnections();
    }, timeoutMs);

    await new Promise((resolve) => server.close(() => { timers.clearTimeout(deadline); resolve(); }));
    await db.end();
    return { drained: !timedOut };
  };
}
