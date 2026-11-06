// @piece close-server: Close the server and wait for in-flight requests
await new Promise((resolve) => {
  server.close(() => timers.clearTimeout(deadline));
  resolve();
});
