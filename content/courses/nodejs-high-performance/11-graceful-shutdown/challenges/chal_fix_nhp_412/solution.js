/**
 * Reference solution (never shipped to learners).
 * Wait for server.close() to report that every connection is gone (by itself or because
 * the deadline forced it), and only then close the pool.
 */
function createShutdown({ server, db, timeoutMs, timers }) {
  let shuttingDown = null;

  async function run() {
    let timedOut = false;

    const deadline = timers.setTimeout(() => {
      timedOut = true;
      server.closeAllConnections();
    }, timeoutMs);

    await new Promise((resolve) => {
      server.close(() => {
        timers.clearTimeout(deadline);
        resolve();
      });
    });

    await db.end();
    return { drained: !timedOut };
  }

  return function shutdown() {
    if (!shuttingDown) shuttingDown = run();
    return shuttingDown;
  };
}
