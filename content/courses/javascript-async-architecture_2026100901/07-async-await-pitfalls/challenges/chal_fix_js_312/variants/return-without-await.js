// Wrong variant: returns the shared promise without await, so the catch block never
// sees the rejection - callers get the raw error, and the failed attempt is never cleared.
function createClientLoader(connect) {
  let pending = null;

  return async function getClient() {
    try {
      if (!pending) pending = connect();
      return pending;
    } catch (error) {
      pending = null;
      throw new Error("Client initialisation failed", { cause: error });
    }
  };
}
