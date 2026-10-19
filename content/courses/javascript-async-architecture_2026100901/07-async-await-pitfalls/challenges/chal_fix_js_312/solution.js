/**
 * Reference solution (never shipped to learners).
 * Cache the promise (set synchronously, so concurrent callers share it), forget it only
 * when it rejects, and await it inside try so the catch block can wrap the failure.
 */
function createClientLoader(connect) {
  let pending = null;

  return async function getClient() {
    if (!pending) {
      const attempt = connect();
      pending = attempt;
      attempt.catch(() => {
        if (pending === attempt) pending = null;
      });
    }
    try {
      return await pending;
    } catch (error) {
      throw new Error("Client initialisation failed", { cause: error });
    }
  };
}
