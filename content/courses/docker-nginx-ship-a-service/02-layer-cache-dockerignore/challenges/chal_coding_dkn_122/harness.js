// Harness: simulates a rebuild of the learner's Dockerfile (the global __source) for the Rice Rocket
// api after a few files changed, with BuildKit's layer-cache rules, and reports what had to run again.
// input: {
//   dockerignore: ["node_modules", ".git", "*.md", ...]  the repository's .dockerignore, one rule per entry
//   changed: ["src/orders.ts"]                            files edited since the previous build
//   costs: { "npm ci": 90 }                               optional, seconds per step (defaults in COSTS)
//   checks: ["build", "npm-ci-cached", ...]
// }
// Output: { <check>: value } for each requested check. "build" is "ok" or the first build error.
//
// Cache model (https://docs.docker.com/build/cache/):
// - COPY/ADD from the context is CACHED when none of the files it copies changed (contents, not mtime),
//   after .dockerignore removed the ignored ones;
// - COPY --from=<stage> is CACHED when nothing it copies was rebuilt in that stage;
// - RUN and the other instructions are CACHED when the instruction text is the same (it is: same Dockerfile);
// - and only while every previous step of the stage was CACHED: after the first miss, everything below runs.

const COSTS = { "npm ci": 90, "npm install": 100, "npm run build": 15, "npm prune": 4, run: 2, copy: 1, contextMbPerSecond: 20 };
const CONTEXT_MB = { node_modules: 420, ".git": 45, src: 2 };
const CONTEXT = [
    "package.json", "package-lock.json", "tsconfig.json", "src/server.ts", "src/orders.ts", "src/menu.ts",
    "README.md", ".env", ".git/HEAD", ".git/index", "node_modules/typescript/package.json",
    "node_modules/express/package.json", "Dockerfile", ".dockerignore",
];

function instructions(text) {
    const out = [];
    let pending = "";
    for (const raw of text.replace(/\r\n/g, "\n").split("\n")) {
        const line = raw.trim();
        if (!pending && (line === "" || line.startsWith("#"))) continue;
        if (line.endsWith("\\")) { pending += line.slice(0, -1) + " "; continue; }
        const full = (pending + line).trim();
        pending = "";
        const m = full.match(/^(\w+)\s*(.*)$/);
        if (m) out.push({ op: m[1].toUpperCase(), args: m[2].trim() });
    }
    return out;
}

// Glob -> RegExp on a relative path: * and ? stay inside one path segment, ** crosses them.
function globRegex(glob) {
    let re = "";
    for (let i = 0; i < glob.length; i++) {
        const c = glob[i];
        if (c === "*" && glob[i + 1] === "*") { re += ".*"; i++; if (glob[i + 1] === "/") i++; }
        else if (c === "*") re += "[^/]*";
        else if (c === "?") re += "[^/]";
        else re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    }
    return re;
}
const clean = (p) => p.replace(/^\.\//, "").replace(/^\/+/, "").replace(/\/+$/, "");

// .dockerignore: a rule matches the path or anything under it; the last matching rule wins, "!" re-includes.
function ignored(file, rules) {
    let out = false;
    for (const raw of rules) {
        const rule = raw.trim();
        if (!rule || rule.startsWith("#")) continue;
        const negate = rule.startsWith("!");
        const re = new RegExp("^" + globRegex(clean(negate ? rule.slice(1) : rule)) + "(/.*)?$");
        if (re.test(file)) out = !negate;
    }
    return out;
}

// Context files a COPY source selects ("." = everything, "src", "src/", "package*.json").
function selectFromContext(src, files) {
    const p = clean(src);
    if (p === "" || p === ".") return files;
    const re = new RegExp("^" + globRegex(p) + "(/.*)?$");
    return files.filter((f) => re.test(f));
}

// Top-level items a COPY --from source selects in another stage ("/app/dist", "./dist", ...).
function selectFromStage(src, stage) {
    let p = clean(src);
    const wd = clean(stage.workdir);
    if (wd && p.startsWith(wd + "/")) p = p.slice(wd.length + 1);
    else if (wd && p === wd) p = "";
    if (p === "" || p === ".") return [...stage.items.keys()];
    const re = new RegExp("^" + globRegex(p.split("/")[0]) + "$");
    return [...stage.items.keys()].filter((k) => re.test(k));
}

function simulate(source, input) {
    const costs = { ...COSTS, ...(input.costs || {}) };
    const rules = input.dockerignore || [];
    const changed = new Set((input.changed || []).map(clean));
    const context = [...new Set([...CONTEXT, ...changed])].filter((f) => !ignored(f, rules));

    const stages = [];
    let stage = null;
    let seconds = 0;
    const installs = [];
    let misses = 0;
    const step = (cost, inputsChanged, outputs) => {
        const miss = stage.broken || inputsChanged;
        if (miss) {
            stage.broken = true;
            misses++;
            seconds += cost;
            for (const o of outputs) stage.dirty.add(o);
        }
        return miss;
    };

    for (const { op, args } of instructions(source)) {
        if (op === "FROM") {
            const m = args.match(/^(?:--\S+\s+)*(\S+)(?:\s+AS\s+(\S+))?/i);
            const parent = stages.find((s) => s.name === m[1]);
            stage = {
                name: m[2] || String(stages.length),
                items: new Map(parent ? parent.items : []),
                env: { ...(parent ? parent.env : {}) },
                user: parent ? parent.user : "root",
                workdir: parent ? parent.workdir : "",
                cmd: null,
                broken: parent ? parent.broken : false,
                dirty: new Set(parent ? parent.dirty : []),
            };
            stages.push(stage);
            continue;
        }
        if (!stage) return { error: `${op} before FROM` };
        if (op === "WORKDIR") { stage.workdir = args.replace(/\/+$/, ""); step(0, false, []); }
        else if (op === "ENV") {
            for (const [, k, v] of args.matchAll(/(\w+)[= ]("[^"]*"|\S+)/g)) stage.env[k] = v.replace(/"/g, "");
            step(0, false, []);
        } else if (op === "USER") { stage.user = args.split(":")[0]; step(0, false, []); }
        else if (op === "CMD" || op === "ENTRYPOINT") { stage.cmd = { exec: args.startsWith("[") }; step(0, false, []); }
        else if (op === "COPY" || op === "ADD") {
            const from = args.match(/--from=(\S+)/);
            const paths = args.replace(/--\S+/g, "").trim().split(/\s+/);
            paths.pop(); // destination
            const copied = [];
            let inputsChanged = false;
            if (from) {
                const src = stages.find((s) => s.name === from[1]);
                if (!src) return { error: `COPY --from=${from[1]}: no such stage` };
                for (const p of paths) {
                    const names = selectFromStage(p, src);
                    if (!names.length) return { error: `COPY --from=${from[1]} ${p}: not found` };
                    for (const n of names) {
                        stage.items.set(n, src.items.get(n));
                        copied.push(n);
                        if (src.dirty.has(n)) inputsChanged = true;
                    }
                }
            } else {
                for (const p of paths) {
                    const files = selectFromContext(p, context);
                    if (!files.length) return { error: `COPY ${p}: not found in the build context` };
                    for (const f of files) {
                        const top = f.split("/")[0];
                        stage.items.set(top, top === "node_modules" ? "host" : true);
                        copied.push(top);
                        if (changed.has(f)) inputsChanged = true;
                    }
                }
            }
            step(costs.copy, inputsChanged, copied);
        } else if (op === "RUN") {
            let cost = 0;
            const outputs = [];
            let install = false;
            for (const cmd of args.split(/&&|;/).map((c) => c.trim())) {
                if (/^npm (ci|install)\b/.test(cmd)) {
                    const ci = /^npm ci/.test(cmd);
                    if (!stage.items.has("package.json")) return { error: "npm: package.json not found" };
                    if (ci && !stage.items.has("package-lock.json")) return { error: "npm ci: package-lock.json not found" };
                    const prodOnly = /--omit=dev|--only=prod|--production/.test(cmd)
                        || (stage.env.NODE_ENV === "production" && !/--include=dev/.test(cmd));
                    stage.items.set("node_modules", prodOnly ? "prod" : "dev");
                    cost += ci ? costs["npm ci"] : costs["npm install"];
                    outputs.push("node_modules");
                    install = true;
                } else if (/^npm prune\b/.test(cmd)) {
                    if (/--omit=dev|--production/.test(cmd) && stage.items.get("node_modules") === "dev") stage.items.set("node_modules", "prod");
                    cost += costs["npm prune"];
                    outputs.push("node_modules");
                } else if (/^npm run build\b/.test(cmd)) {
                    if (!stage.items.has("src")) return { error: "npm run build: src/ not found" };
                    if (!stage.items.has("tsconfig.json")) return { error: "npm run build: tsconfig.json not found" };
                    if (!["dev", "host"].includes(stage.items.get("node_modules"))) return { error: "npm run build: tsc not found (devDependencies are not installed)" };
                    stage.items.set("dist", true);
                    cost += costs["npm run build"];
                    outputs.push("dist");
                } else {
                    cost += costs.run;
                }
            }
            const miss = step(cost, false, outputs);
            if (install) installs.push(miss);
        } else {
            step(0, false, []); // EXPOSE, LABEL, ARG, ...: metadata only
        }
    }
    if (!stages.length) return { error: "no FROM instruction" };
    // Sending the context is paid on every build (a fresh CI runner has nothing to diff against).
    const tops = new Set(context.map((f) => f.split("/")[0]));
    const contextMb = [...tops].reduce((sum, t) => sum + (CONTEXT_MB[t] ?? 0.01), 0);
    seconds += contextMb / costs.contextMbPerSecond;
    return { stages, final: stages[stages.length - 1], seconds: Math.round(seconds * 10) / 10, installs, misses };
}

async function __harness(input) {
    const result = simulate(__source, input);
    const out = {};
    for (const check of input.checks) {
        if (check === "build") { out.build = result.error ? `error: ${result.error}` : "ok"; continue; }
        if (result.error) { out[check] = false; continue; }
        const { stages, final, seconds, installs, misses } = result;
        out[check] = {
            "multi-stage": stages.length >= 2,
            "has-build-output": final.items.has("dist"),
            "no-dev-dependencies": final.items.get("node_modules") === "prod",
            "exec-form-cmd": Boolean(final.cmd && final.cmd.exec),
            "non-root": !["root", "0", ""].includes(final.user),
            "npm-ci-cached": installs.length > 0 && installs.every((miss) => !miss),
            "fully-cached": misses === 0,
            "rebuild-under-30s": seconds < 30,
            "rebuild-seconds": seconds,
        }[check];
    }
    return out;
}
