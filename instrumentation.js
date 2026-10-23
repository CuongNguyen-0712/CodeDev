/**
 * Runs once when the server starts. Verifies that the process is wired to the services of its
 * own environment (development -> local PostgreSQL / Redis / MinIO, production -> Neon /
 * Upstash / S3) before it serves traffic.
 */
export async function register() {
    if (process.env.NEXT_RUNTIME !== "nodejs") return;

    const { checkEnvironment } = await import("./lib/envCheck.mjs");
    const { environment, storage, mail, fatal, errors, warnings } = checkEnvironment();

    console.info(`[env] ${environment} (storage: ${storage}; mail: ${mail})`);
    for (const message of warnings) console.warn(`[env] ${message}`);
    for (const message of errors) console.error(`[env] ${message}`);

    // Only a broken environment split stops production; missing settings fail where they are used.
    if (environment === "production" && fatal.length > 0) {
        throw new Error(`Production is wired to development services: ${fatal.join("; ")}`);
    }
}
