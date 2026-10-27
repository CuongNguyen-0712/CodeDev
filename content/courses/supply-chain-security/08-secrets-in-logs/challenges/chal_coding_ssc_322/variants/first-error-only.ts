import { readFileSync } from "node:fs";

// Wrong: reports only the first problem.

type Env = Record<string, string | undefined>;
type Config = Record<string, string | undefined>;
type Spec = { name: string; required: boolean; secret: boolean; default?: string; valid: (value: string) => boolean };

// ---------------------------------------------------------------- schema (do not change)
const SCHEMA: Spec[] = [
    { name: "NODE_ENV", required: true, secret: false, valid: (v) => ["development", "test", "production"].includes(v) },
    { name: "PORT", required: false, secret: false, default: "3000", valid: (v) => /^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= 65535 },
    { name: "LOG_LEVEL", required: false, secret: false, default: "info", valid: (v) => ["debug", "info", "warn", "error"].includes(v) },
    { name: "PUBLIC_APP_URL", required: true, secret: false, valid: (v) => v.startsWith("https://") },
    { name: "DATABASE_URL", required: true, secret: true, valid: (v) => /^postgres(ql)?:\/\/./.test(v) },
    { name: "REDIS_URL", required: false, secret: true, valid: (v) => /^rediss?:\/\/./.test(v) },
    { name: "JWT_SECRET", required: true, secret: true, valid: (v) => v.length >= 32 },
    { name: "SANDBOX_API_KEY", required: true, secret: true, valid: (v) => v.length >= 20 },
];

// ---------------------------------------------------------------- config loader
function mask(value: string): string {
    return value.length >= 20 ? "***" + value.slice(-4) : "***";
}

function loadConfig(env: Env, log: (line: string) => void): Config {
    const config: Config = {};
    for (const spec of SCHEMA) config[spec.name] = env[spec.name] || spec.default;

    const missing: string[] = [];
    const invalid: string[] = [];
    for (const spec of SCHEMA) {
        const value = config[spec.name];
        if (value === undefined) {
            if (spec.required) throw new Error(`Invalid configuration: missing ${spec.name}`);
            continue;
        }
        if (!spec.valid(value)) throw new Error(`Invalid configuration: invalid ${spec.name}`);
    }
    if (missing.length > 0 || invalid.length > 0) {
        const parts: string[] = [];
        if (missing.length > 0) parts.push(`missing ${missing.join(", ")}`);
        if (invalid.length > 0) parts.push(`invalid ${invalid.join(", ")}`);
        throw new Error(`Invalid configuration: ${parts.join("; ")}`);
    }

    const summary = SCHEMA.map(({ name, secret }) => {
        const value = config[name];
        if (value === undefined) return `${name}=(unset)`;
        return `${name}=${secret ? mask(value) : value}`;
    });
    log(`config ok: ${summary.join(" ")}`);
    return config;
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: { "env": { "NAME": "value", ... } }. Prints every line passed to log as "log: <line>", then
// "ok" or "error: <message of the thrown error>", then "leaked: <NAME>" for every secret variable
// whose full value appears anywhere in that output.
const { env }: { env: Env } = JSON.parse(readFileSync(0, "utf8"));
const lines: string[] = [];
let result: string;
try {
    loadConfig(env, (line) => lines.push(line));
    result = "ok";
} catch (error) {
    result = `error: ${error instanceof Error ? error.message : String(error)}`;
}
for (const line of lines) console.log(`log: ${line}`);
console.log(result);
const printed = [...lines, result].join("\n");
for (const spec of SCHEMA) {
    const value = env[spec.name];
    if (spec.secret && value && value.length >= 8 && printed.includes(value)) console.log(`leaked: ${spec.name}`);
}
