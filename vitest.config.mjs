import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL(".", import.meta.url));

// Only what the tests need, read from .env / .env.local like `next dev` does.
const env = loadEnv("development", root, "");

export default defineConfig({
    resolve: {
        alias: { "@": root },
    },
    test: {
        environment: "node",
        // `/tests` is git-ignored in this repository, so committed tests live in __tests__.
        include: ["__tests__/**/*.test.js"],
        testTimeout: 30_000,
        hookTimeout: 30_000,
        // Integration tests share one database: run files one after another.
        fileParallelism: false,
        env: {
            NODE_ENV: "test",
            DATABASE_URL: env.DATABASE_URL || "",
            REFRESH_TOKEN_HASH_SECRET: env.REFRESH_TOKEN_HASH_SECRET || "test-refresh-secret",
            NEXTAUTH_SECRET: env.NEXTAUTH_SECRET || "test-nextauth-secret",
            NEXTAUTH_URL: "http://localhost:3000",
            // Tests never touch the shared Redis or Pusher; the in-memory fallback is used.
            REDIS_URL: "",
            PUSHER_APP_ID: "",
            PUSHER_KEY: "",
            PUSHER_SECRET: "",
            AUTH_OUTBOX_WORKER: "off",
            // Background work runs inline in tests (lib/inngest.js), never through an Inngest server.
            INNGEST_EVENT_KEY: "",
            INNGEST_DEV: "",
            APP_ENV: "test",
            // Storage tests run against the local MinIO when it is reachable (never the remote bucket).
            STORAGE_PROVIDER: "minio",
            MINIO_ENDPOINT: env.MINIO_ENDPOINT || "",
            MINIO_ROOT_USER: env.MINIO_ROOT_USER || "",
            MINIO_ROOT_PASSWORD: env.MINIO_ROOT_PASSWORD || "",
        },
    },
});
