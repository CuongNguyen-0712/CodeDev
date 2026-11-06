// @piece loader: Share one connection attempt between callers
let pending = null;

return async function getClient() {
  if (!pending) pending = connect();
  try {
    return await pending;
  } catch (error) {
    throw new Error("Client initialisation failed", { cause: error });
  }
};
