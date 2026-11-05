// Harness: simulates `docker build` of the learner's Dockerfile (the global __source) for the
// Rice Rocket api (TypeScript in src/, compiled by `npm run build` into dist/).
// input: { context: ["package.json", ...], checks: ["build", "multi-stage", ...] }
// Output: { <check>: value } for each requested check. "build" is "ok" or the first build error.
//
// The model: each stage holds a set of top-level items ("src", "dist", "package.json",
// "node_modules" with kind dev | prod | host, ".env", ...). Sizes are rough MB figures.

const BASE_MB = { full: 1100, slim: 220, alpine: 160 };
const ITEM_MB = { src: 4, dist: 3, ".git": 45, "node_modules:dev": 380, "node_modules:prod": 70, "node_modules:host": 420 };

function instructions(text) {
    const lines = text.replace(/\r\n/g, "\n").split("\n");
    const out = [];
    let pending = "";
    for (const raw of lines) {
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

const baseKind = (image) => (/alpine/.test(image) ? "alpine" : /slim|distroless/.test(image) ? "slim" : "full");

// "/app/dist", "./dist", "dist/", "package*.json" -> top-level item names (or "*" for everything).
function itemsFor(path, workdir) {
    let p = path.replace(/^\.\//, "");
    if (workdir && p.startsWith(workdir + "/")) p = p.slice(workdir.length + 1);
    else if (workdir && p === workdir) p = ".";
    p = p.replace(/^\/+/, "").replace(/\/+$/, "");
    if (p === "." || p === "" || p === "*") return ["*"];
    const top = p.split("/")[0];
    if (top.includes("*")) {
        const re = new RegExp("^" + top.replace(/\./g, "\\.").replace(/\*/g, ".*") + "$");
        return [{ pattern: re }];
    }
    return [top];
}

function build(source, context) {
    const stages = [];
    let stage = null;
    for (const { op, args } of instructions(source)) {
        if (op === "FROM") {
            const m = args.match(/^(?:--\S+\s+)*(\S+)(?:\s+AS\s+(\S+))?/i);
            const image = m[1];
            const parent = stages.find((s) => s.name === image);
            stage = {
                name: m[2] || String(stages.length),
                base: parent ? parent.base : baseKind(image),
                items: new Map(parent ? parent.items : []),
                env: { ...(parent ? parent.env : {}) },
                user: parent ? parent.user : "root",
                workdir: parent ? parent.workdir : "",
                cmd: null,
            };
            stages.push(stage);
            continue;
        }
        if (!stage) return { error: `${op} before FROM` };
        if (op === "WORKDIR") stage.workdir = args.replace(/\/+$/, "");
        else if (op === "ENV") {
            for (const [, k, v] of args.matchAll(/(\w+)[= ]("[^"]*"|\S+)/g)) stage.env[k] = v.replace(/"/g, "");
        } else if (op === "USER") stage.user = args.split(":")[0];
        else if (op === "CMD" || op === "ENTRYPOINT") stage.cmd = { op, exec: args.startsWith("[") };
        else if (op === "COPY" || op === "ADD") {
            const from = args.match(/--from=(\S+)/);
            const paths = args.replace(/--\S+/g, "").trim().split(/\s+/);
            paths.pop(); // destination
            let source = null;
            if (from) {
                source = stages.find((s) => s.name === from[1]);
                if (!source) return { error: `COPY --from=${from[1]}: no such stage` };
            }
            const available = source ? source.items : new Map(context.map((c) => [c, c === "node_modules" ? "host" : true]));
            for (const p of paths) {
                for (const item of itemsFor(p, source ? source.workdir : "")) {
                    const names = [...available.keys()].filter((k) => item === "*" || (item.pattern ? item.pattern.test(k) : k === item));
                    if (!names.length) return { error: `COPY ${p}: not found` };
                    for (const n of names) stage.items.set(n, available.get(n));
                }
            }
        } else if (op === "RUN") {
            for (const cmd of args.split(/&&|;/).map((c) => c.trim())) {
                if (/^npm (ci|install)\b/.test(cmd)) {
                    if (!stage.items.has("package.json")) return { error: "npm: package.json not found" };
                    if (/^npm ci/.test(cmd) && !stage.items.has("package-lock.json")) return { error: "npm ci: package-lock.json not found" };
                    const prodOnly = /--omit=dev|--only=prod|--production/.test(cmd)
                        || (stage.env.NODE_ENV === "production" && !/--include=dev/.test(cmd));
                    stage.items.set("node_modules", prodOnly ? "prod" : "dev");
                } else if (/^npm prune\b/.test(cmd) && /--omit=dev|--production/.test(cmd)) {
                    if (stage.items.get("node_modules") === "dev") stage.items.set("node_modules", "prod");
                } else if (/^npm run build\b/.test(cmd)) {
                    if (!stage.items.has("src")) return { error: "npm run build: src/ not found" };
                    if (stage.items.get("node_modules") !== "dev") return { error: "npm run build: tsc not found (devDependencies are not installed)" };
                    stage.items.set("dist", true);
                }
            }
        }
    }
    if (!stages.length) return { error: "no FROM instruction" };
    return { stages, final: stages[stages.length - 1] };
}

function sizeMb(stage) {
    let mb = BASE_MB[stage.base];
    for (const [name, kind] of stage.items) {
        mb += name === "node_modules" ? ITEM_MB[`node_modules:${kind}`] : (ITEM_MB[name] || 1);
    }
    return mb;
}

async function __harness(input) {
    const context = input.context || ["package.json", "package-lock.json", "tsconfig.json", "src", "README.md", ".git", ".env", "node_modules"];
    const result = build(__source, context);
    const out = {};
    for (const check of input.checks) {
        if (check === "build") { out.build = result.error ? `error: ${result.error}` : "ok"; continue; }
        if (result.error) { out[check] = false; continue; }
        const { stages, final } = result;
        const modules = final.items.get("node_modules");
        out[check] = {
            "multi-stage": stages.length >= 2,
            "has-build-output": final.items.has("dist"),
            "no-dev-dependencies": modules === "prod",
            "no-source-in-final": !final.items.has("src"),
            "exec-form-cmd": Boolean(final.cmd && final.cmd.exec),
            "non-root": !["root", "0", ""].includes(final.user),
            "slim-base": final.base !== "full",
            "size-under-300mb": sizeMb(final) < 300,
            "no-secrets": !final.items.has(".env") && !final.items.has(".git"),
        }[check];
    }
    return out;
}
