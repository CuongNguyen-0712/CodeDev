/**
 * Gateway to the sandbox (compose service `sandbox-gateway`, profiles dev and app): for `next dev`
 * on the host (127.0.0.1:4100) and for the app container (sandbox-gateway:4100).
 *
 * The sandbox only joins the `sandbox` network, which is `internal` (no route out of Docker),
 * and Docker cannot publish ports from an internal-only container. This process joins both
 * networks and forwards raw TCP to sandbox:4100, so the sandbox itself keeps no egress and the
 * app stays off the sandbox network (learner code cannot reach it). It runs no user code.
 */
import net from "node:net";

const LISTEN_PORT = Number(process.env.PORT) || 4100;
const TARGET_HOST = process.env.TARGET_HOST || "sandbox";
const TARGET_PORT = Number(process.env.TARGET_PORT) || 4100;

const server = net.createServer((client) => {
    const upstream = net.connect(TARGET_PORT, TARGET_HOST);
    client.pipe(upstream).pipe(client);
    const close = () => {
        client.destroy();
        upstream.destroy();
    };
    client.on("error", close);
    upstream.on("error", close);
});

server.listen(LISTEN_PORT, () => console.log(`[sandbox-gateway] :${LISTEN_PORT} -> ${TARGET_HOST}:${TARGET_PORT}`));

for (const signal of ["SIGTERM", "SIGINT"]) {
    process.on(signal, () => server.close(() => process.exit(0)));
}
