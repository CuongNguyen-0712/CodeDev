/**
 * Builds the SIGTERM handler of the payments API:
 *   process.on("SIGTERM", createShutdown({ server, db, timeoutMs: 10_000, timers }));
 *
 * Intended order:
 *   1. stop accepting new connections            server.close(callback)
 *   2. let in-flight requests finish             the callback fires once none are left
 *   3. after timeoutMs, cut off what is left     server.closeAllConnections()
 *   4. only then close the database pool         await db.end()
 *   5. resolve with { drained } - true when every request finished by itself
 * Calling shutdown() again (a second SIGTERM) must not start a second shutdown.
 *
 * BUG: every deploy fails the payments that are in flight with "pool closed",
 * even though server.close() is called first. Fix the order of operations.
 *
 * @param {{
 *   server: { close(callback?: () => void): void, closeAllConnections(): void },
 *   db: { end(): Promise<void> },
 *   timeoutMs: number,
 *   timers: { setTimeout(fn: () => void, ms: number): any, clearTimeout(handle: any): void },
 * }} deps
 * @returns {() => Promise<{ drained: boolean }>}
 */
function createShutdown({ server, db, timeoutMs, timers }) {
  let shuttingDown = null;

  async function run() {
    let timedOut = false;

    const deadline = timers.setTimeout(() => {
      timedOut = true;
      server.closeAllConnections(); // drop whatever is still running
    }, timeoutMs);

    // Stop accepting new connections. The callback fires once in-flight requests are done.
    server.close(() => timers.clearTimeout(deadline));

    await db.end();
    return { drained: !timedOut };
  }

  return function shutdown() {
    if (!shuttingDown) shuttingDown = run();
    return shuttingDown;
  };
}
