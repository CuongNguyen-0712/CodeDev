// Wrong variant: clears the cached promise in finally - after a failure AND after a
// success, so every call after the first connection opens a new one.
function createClientLoader(connect) {
  let pending = null;

  return async function getClient() {
    if (!pending) pending = connect();
    try {
      return await pending;
    } catch (error) {
      throw new Error("Client initialisation failed", { cause: error });
    } finally {
      pending = null;
    }
  };
}
