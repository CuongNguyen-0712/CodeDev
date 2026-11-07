import { fileURLToPath } from "node:url";
import { loadEnv, transformWithOxc } from "vite";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL(".", import.meta.url));

// Only what the tests need, read from .env / .env.local like `next dev` does.
const env = loadEnv("development", root, "");

// Next compiles JSX in .js files too (constants/constants.js, components/index.js); Vite only
// parses JSX in .jsx, so the project's own .js files that contain JSX are transformed first.
const jsxInJs = {
    name: "codedev:jsx-in-js",
    enforce: "pre",
    transform(code, id) {
        if (!id.endsWith(".js") || id.includes("/node_modules/") || !/<[A-Z][\w.]*[\s/>]|<\/?>/.test(code)) return null;
        return transformWithOxc(code, id, { lang: "jsx", jsx: { runtime: "automatic" } });
    },
};

export default defineConfig({
    resolve: {
        alias: { "@": root },
    },
    // Components use the automatic JSX runtime (no `import React`), as Next compiles them.
    oxc: { jsx: { runtime: "automatic" } },
    plugins: [jsxInJs],
    test: {
        environment: "node",
        // `/tests` is git-ignored in this repository, so committed tests live in __tests__.
        // Component tests (*.test.jsx) opt into jsdom with `// @vitest-environment jsdom`.
        include: ["__tests__/**/*.test.{js,jsx}"],
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
            BEAMS_INSTANCE_ID: "",
            BEAMS_SECRET_KEY: "",
            NEXT_PUBLIC_BEAMS_INSTANCE_ID: "",
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
