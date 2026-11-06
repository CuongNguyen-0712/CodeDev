// @piece loader: Share one connection attempt between callers
let client = null;

return async function getClient() {
  try {
    if (!client) client = await connect();
    return client;
  } catch (error) {
    throw new Error("Client initialisation failed");
  }
};
