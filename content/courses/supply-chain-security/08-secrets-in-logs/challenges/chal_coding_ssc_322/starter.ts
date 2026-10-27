import { readFileSync } from "node:fs";

// Fix it: a config loader that prints secrets. src/config.ts runs first in the API server, in
// `next build` on CI and in every preview deploy. Two incidents this month:
//   - CI build #1187 failed. Its public log showed the error "LOG_LEVEL invalid: verbose" and, on the
//     line above it, the whole configuration as JSON, including SANDBOX_API_KEY.
//   - A preview deploy crashed with "DATABASE_URL invalid: postgres:/codedev_app:<password>@..."
//     in the hosting provider's log, which the whole team can read.
// Even a successful start prints DATABASE_URL and SANDBOX_API_KEY in clear text.
//
// Fix loadConfig so that no secret value (a SCHEMA entry with secret: true) is ever logged or put in
// an error message:
//   - Missing (unset or empty) and invalid variables are reported together, by NAME only, in one
//     thrown Error: "Invalid configuration: missing A, B; invalid C" (names in SCHEMA order; leave out
//     the "missing ..." or "invalid ..." part when it is empty). Nothing is logged in that case.
//   - On success, log exactly one line: "config ok: " + NAME=value for every SCHEMA entry, in SCHEMA
//     order, separated by spaces. Defaults apply; an optional variable that is not set shows
//     NAME=(unset). A secret shows "***" followed by its last 4 characters when the value has 20 or
//     more characters, and only "***" when it is shorter.
// Do not change the schema or the test runner.

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
// Shows enough of a secret to tell two keys apart in a log.
function mask(value: string): string {
    return "***" + value.slice(-4);
}

function isSecret(name: string): boolean {
    return /SECRET|PASSWORD/.test(name);
}

function loadConfig(env: Env, log: (line: string) => void): Config {
    const config: Config = {};
    for (const spec of SCHEMA) config[spec.name] = env[spec.name] || spec.default;
    log(`loading config ${JSON.stringify(config)}`); // added while debugging the preview deploy

    for (const spec of SCHEMA) {
        const value = config[spec.name];
        if (value === undefined) {
            if (spec.required) throw new Error(`${spec.name} is required`);
            continue;
        }
        if (!spec.valid(value)) throw new Error(`${spec.name} invalid: ${value}`);
    }

    const summary = SCHEMA.map(({ name }) => {
        const value = config[name];
        if (value === undefined) return `${name}=(unset)`;
        return `${name}=${isSecret(name) ? mask(value) : value}`;
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
