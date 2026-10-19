/**
 * Lazily connects a client (feature flags, analytics, a WebSocket...) on first use.
 * Every widget calls getClient() whenever it needs the client - often several of them
 * during the same page load, before the first connection has finished.
 *
 * Expected behaviour:
 *   - Concurrent callers share ONE call to connect() and all get the same client.
 *   - Once connected, later calls return the same client without connecting again.
 *   - If connect() rejects, every caller waiting for that attempt rejects with
 *     new Error("Client initialisation failed", { cause: originalError }).
 *   - A failed attempt is not remembered: the next call to getClient() tries connect() again.
 *
 * BUGS (reported from production): the flag vendor bills three connections per tab,
 * and Sentry only ever shows "Client initialisation failed" with no root cause.
 *
 * @template T
 * @param {() => Promise<T>} connect
 * @returns {() => Promise<T>} getClient
 */
function createClientLoader(connect) {
  let client = null;

  return async function getClient() {
    try {
      if (!client) client = await connect();
      return client;
    } catch (error) {
      throw new Error("Client initialisation failed");
    }
  };
}
