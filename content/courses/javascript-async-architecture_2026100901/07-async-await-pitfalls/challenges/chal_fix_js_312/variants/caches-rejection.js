// Wrong variant: shares the promise and keeps the cause, but never forgets a failed
// attempt - one network blip breaks the client until the page is reloaded.
function createClientLoader(connect) {
  let pending = null;

  return async function getClient() {
    if (!pending) pending = connect();
    try {
      return await pending;
    } catch (error) {
      throw new Error("Client initialisation failed", { cause: error });
    }
  };
}
