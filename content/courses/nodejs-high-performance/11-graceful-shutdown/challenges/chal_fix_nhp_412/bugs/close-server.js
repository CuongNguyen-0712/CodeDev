// @piece close-server: Close the server and wait for in-flight requests
server.close(() => timers.clearTimeout(deadline));
