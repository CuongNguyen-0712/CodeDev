/**
 * Which deployment environment the process runs in. Plain ESM with no dependencies, so the app,
 * the tests and the node scripts in scripts/ share one definition.
 *
 *   APP_ENV = development | production | test
 *
 * Defaults to NODE_ENV (`next dev` -> development, `next build` / `next start` -> production,
 * vitest -> test). Set APP_ENV explicitly when the two differ, e.g. a production build started
 * locally against local services (`APP_ENV=development next start`).
 */

export const APP_ENVS = ["development", "production", "test"];

export function appEnv(env = process.env) {
    const explicit = String(env.APP_ENV || "").trim().toLowerCase();
    if (APP_ENVS.includes(explicit)) return explicit;
    if (env.NODE_ENV === "test") return "test";
    return env.NODE_ENV === "production" ? "production" : "development";
}

export const isProductionEnv = (env = process.env) => appEnv(env) === "production";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "0.0.0.0", "host.docker.internal"]);

/** True for loopback hosts (localhost, 127.0.0.1, ::1, *.localhost, host.docker.internal). */
export function isLocalUrl(value) {
    if (!value) return false;
    let host;
    try {
        host = new URL(value).hostname.toLowerCase();
    } catch {
        return false;
    }
    return LOCAL_HOSTS.has(host)
        || host.endsWith(".localhost");
}
