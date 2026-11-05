// ==== GitHub Actions workflow simulator: shared core =============================================
// The same block opens every harness.js of the github-actions-ci-cd course; the checks of each
// challenge follow it. It models the documented behaviour (docs.github.com/actions), not a runner:
// a YAML subset, the expression language, trigger filters, matrices and GITHUB_TOKEN permissions.

// ---- YAML subset: block maps and lists by indentation, "- key: value" items, plain scalars typed
// as in YAML 1.2 (null, true/false, numbers), quoted strings, inline [..] / {..}, | and > block
// scalars, comments. No anchors, no multi-document files.
function parseYaml(text) {
    const raw = String(text).replace(/\r\n?/g, "\n").split("\n");
    const lines = [];
    for (let i = 0; i < raw.length; i++) {
        const lead = raw[i].match(/^[ \t]*/)[0];
        const body = stripComment(raw[i].slice(lead.length)).trimEnd();
        if (body === "" || body === "---") continue;
        if (lead.includes("\t")) throw new Error(`line ${i + 1}: tabs are not allowed for indentation`);
        const line = { no: i + 1, indent: lead.length, text: body };
        const head = body.match(/(^-\s+|:\s+|^)([|>])([-+]?)$/);
        if (head && (head[1] !== "" || body === head[2] + head[3])) {
            // Block scalar: the following lines indented deeper than its key (or item) are its text.
            const item = body.match(/^-\s+/);
            const owner = item && head[1] !== item[0] ? lead.length + item[0].length : lead.length;
            const own = [];
            let j = i + 1;
            let blockIndent = null;
            for (; j < raw.length; j++) {
                if (raw[j].trim() === "") { own.push(""); continue; }
                const ind = raw[j].match(/^ */)[0].length;
                if (ind <= owner || (blockIndent !== null && ind < blockIndent)) break;
                if (blockIndent === null) blockIndent = ind;
                own.push(raw[j].slice(blockIndent));
            }
            let trailing = 0;
            while (own.length && own[own.length - 1] === "") { own.pop(); trailing++; }
            j -= trailing;
            let value = head[2] === "|"
                ? own.join("\n")
                : own.reduce((acc, l) => (l === "" ? `${acc}\n` : acc === "" || acc.endsWith("\n") ? acc + l : `${acc} ${l}`), "");
            if (head[3] === "" && own.length) value += "\n";
            if (head[3] === "+") value += "\n".repeat(trailing + 1);
            line.block = value;
            i = j - 1;
        }
        lines.push(line);
    }
    let pos = 0;
    const fail = (line, msg) => { throw new Error(`line ${line.no}: ${msg}`); };
    const KEY = /^("(?:[^"\\]|\\.)*"|'[^']*'|[^\s"'#\[{][^:]*?)\s*:(?:\s+(.*))?$/;
    const isItem = (t) => t === "-" || t.startsWith("- ");
    const value = (raw, line) => (line.block !== undefined && /^[|>][-+]?$/.test(raw.trim()) ? line.block : scalar(raw, line));

    function node() {
        const line = lines[pos];
        return isItem(line.text) ? list(line.indent) : map(line.indent);
    }
    function map(indent) {
        const obj = {};
        while (pos < lines.length) {
            const line = lines[pos];
            if (line.indent < indent) break;
            if (line.indent > indent) fail(line, "unexpected indentation");
            if (isItem(line.text)) fail(line, "a list item where a key was expected (check the indentation)");
            const m = line.text.match(KEY);
            if (!m) fail(line, `expected "key: value", got "${line.text}"`);
            const key = unquote(m[1]);
            if (Object.hasOwn(obj, key)) fail(line, `duplicate key "${key}"`);
            pos++;
            if (m[2] !== undefined && m[2].trim() !== "") {
                obj[key] = value(m[2], line);
                continue;
            }
            const next = lines[pos];
            if (next && next.indent > indent) obj[key] = node();
            else if (next && next.indent === indent && isItem(next.text)) obj[key] = list(indent);
            else obj[key] = null;
        }
        return obj;
    }
    function list(indent) {
        const arr = [];
        while (pos < lines.length) {
            const line = lines[pos];
            if (line.indent < indent) break;
            if (line.indent > indent) fail(line, "unexpected indentation");
            if (!isItem(line.text)) break;
            const rest = line.text.slice(1).trimStart();
            if (rest === "") {
                pos++;
                const next = lines[pos];
                arr.push(next && next.indent > indent ? node() : null);
            } else if (KEY.test(rest)) {
                // "- key: value": a map whose keys line up with the first one.
                const inner = indent + (line.text.length - rest.length);
                lines[pos] = { ...line, indent: inner, text: rest };
                arr.push(map(inner));
            } else {
                arr.push(value(rest, line));
                pos++;
            }
        }
        return arr;
    }
    const result = lines.length ? node() : {};
    if (pos < lines.length) fail(lines[pos], "unexpected indentation");
    return result;
}

function stripComment(s) {
    let quote = null;
    for (let i = 0; i < s.length; i++) {
        const c = s[i];
        if (quote) {
            if (c === "\\" && quote === '"') i++;
            else if (c === quote) quote = null;
        } else if (c === '"' || c === "'") quote = c;
        else if (c === "#" && (i === 0 || /\s/.test(s[i - 1]))) return s.slice(0, i);
    }
    return s;
}

function unquote(s) {
    if (s.startsWith('"')) return s.slice(1, -1).replace(/\\(.)/g, (_, c) => (c === "n" ? "\n" : c === "t" ? "\t" : c));
    if (s.startsWith("'")) return s.slice(1, -1).replace(/''/g, "'");
    return s;
}

function splitTop(s) {
    const parts = [];
    let depth = 0, quote = null, cur = "";
    for (const c of s) {
        if (quote) { if (c === quote) quote = null; }
        else if (c === '"' || c === "'") quote = c;
        else if (c === "[" || c === "{") depth++;
        else if (c === "]" || c === "}") depth--;
        else if (c === "," && depth === 0) { parts.push(cur.trim()); cur = ""; continue; }
        cur += c;
    }
    if (cur.trim()) parts.push(cur.trim());
    return parts;
}

function scalar(raw, line) {
    const s = raw.trim();
    const fail = (msg) => { throw new Error(`line ${line.no}: ${msg}`); };
    if (s.startsWith('"')) {
        if (!/^"(?:[^"\\]|\\.)*"$/.test(s)) fail("unterminated string, or text after the closing quote");
        return unquote(s);
    }
    if (s.startsWith("'")) {
        if (!/^'(?:[^']|'')*'$/.test(s)) fail("unterminated string, or text after the closing quote");
        return unquote(s);
    }
    if (s.startsWith("[")) {
        if (!s.endsWith("]")) fail("an inline list must end with ]");
        return splitTop(s.slice(1, -1)).map((item) => scalar(item, line));
    }
    if (s.startsWith("{")) {
        if (!s.endsWith("}")) fail("an inline map must end with }");
        const obj = {};
        for (const pair of splitTop(s.slice(1, -1))) {
            const m = pair.match(/^("[^"]*"|'[^']*'|[^:]+?)\s*:\s*(.*)$/);
            if (!m) fail(`expected "key: value" in {...}, got "${pair}"`);
            obj[unquote(m[1])] = m[2] === "" ? null : scalar(m[2], line);
        }
        return obj;
    }
    if (/^[|>][-+]?$/.test(s)) fail("a block scalar (| or >) needs its text on the lines below, indented deeper");
    if (/^(null|Null|NULL|~)$/.test(s)) return null;
    if (/^(true|True|TRUE)$/.test(s)) return true;
    if (/^(false|False|FALSE)$/.test(s)) return false;
    if (/^[-+]?(\d+|\d+\.\d*|\.\d+)([eE][-+]?\d+)?$/.test(s)) return Number(s);
    return s;
}

// ---- Expressions: ${{ ... }} as documented in "Evaluate expressions in workflows and actions".
const isMap = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const list = (v) => (Array.isArray(v) ? v : v === undefined || v === null ? [] : [v]);

function tokenize(src) {
    const toks = [];
    let i = 0;
    while (i < src.length) {
        const c = src[i];
        if (/\s/.test(c)) { i++; continue; }
        if (c === "'") {
            let j = i + 1, s = "";
            for (;;) {
                if (j >= src.length) throw new Error(`unterminated string in expression: ${src}`);
                if (src[j] === "'") { if (src[j + 1] === "'") { s += "'"; j += 2; continue; } break; }
                s += src[j++];
            }
            toks.push({ t: "str", v: s });
            i = j + 1;
            continue;
        }
        const two = src.slice(i, i + 2);
        if (["==", "!=", "<=", ">=", "&&", "||"].includes(two)) { toks.push({ t: "op", v: two }); i += 2; continue; }
        if ("!<>()[],.*".includes(c)) { toks.push({ t: "op", v: c }); i++; continue; }
        const num = src.slice(i).match(/^(0x[0-9a-fA-F]+|\d+(\.\d+)?([eE][-+]?\d+)?)/);
        if (num) { toks.push({ t: "num", v: Number(num[0]) }); i += num[0].length; continue; }
        const id = src.slice(i).match(/^[A-Za-z_][A-Za-z0-9_-]*/);
        if (id) { toks.push({ t: "id", v: id[0] }); i += id[0].length; continue; }
        throw new Error(`unexpected "${c}" in expression: ${src}`);
    }
    return toks;
}

function toNum(v) {
    if (v === null) return 0;
    if (typeof v === "boolean") return v ? 1 : 0;
    if (typeof v === "number") return v;
    if (typeof v === "string") return v.trim() === "" ? 0 : Number(v.trim());
    return NaN;
}

function truthy(v) {
    return !(v === false || v === null || v === "" || v === 0 || Number.isNaN(v) || v === undefined);
}

function looseEq(a, b) {
    if ((isMap(a) || Array.isArray(a)) || (isMap(b) || Array.isArray(b))) return a === b;
    if (typeof a === "string" && typeof b === "string") return a.toLowerCase() === b.toLowerCase();
    if (typeof a === typeof b) return a === b;
    return toNum(a) === toNum(b);
}

function compare(a, op, b) {
    let x = a, y = b;
    if (!(typeof a === "string" && typeof b === "string")) { x = toNum(a); y = toNum(b); }
    else { x = a.toLowerCase(); y = b.toLowerCase(); }
    return op === "<" ? x < y : op === ">" ? x > y : op === "<=" ? x <= y : x >= y;
}

function toStr(v) {
    if (v === null || v === undefined) return "";
    if (typeof v === "boolean" || typeof v === "number") return String(v);
    if (typeof v === "string") return v;
    return JSON.stringify(v, null, 2);
}

function prop(v, k) {
    if (v === null || v === undefined) return null;
    if (Array.isArray(v) && typeof k === "number") return k in v ? v[k] : null;
    if (!isMap(v)) return null;
    const key = String(k);
    if (Object.hasOwn(v, key)) return v[key];
    const found = Object.keys(v).find((x) => x.toLowerCase() === key.toLowerCase());
    return found === undefined ? null : v[found];
}

function callFn(name, args, ctx) {
    const s = (i) => toStr(args[i]);
    switch (name.toLowerCase()) {
        case "contains":
            return Array.isArray(args[0]) ? args[0].some((x) => looseEq(x, args[1])) : s(0).toLowerCase().includes(s(1).toLowerCase());
        case "startswith": return s(0).toLowerCase().startsWith(s(1).toLowerCase());
        case "endswith": return s(0).toLowerCase().endsWith(s(1).toLowerCase());
        case "format": return s(0).replace(/\{(\d+)\}/g, (_, n) => toStr(args[Number(n) + 1]));
        case "join": return Array.isArray(args[0]) ? args[0].map(toStr).join(args.length > 1 ? s(1) : ",") : s(0);
        case "tojson": return JSON.stringify(args[0], null, 2);
        case "fromjson": return JSON.parse(s(0));
        case "hashfiles": return ctx.__hashFiles ? ctx.__hashFiles(args.map(toStr)) : "";
        case "success": case "failure": case "always": case "cancelled":
            return ctx.__status ? ctx.__status(name.toLowerCase()) : name.toLowerCase() === "success" || name.toLowerCase() === "always";
        default: throw new Error(`Unrecognized function: '${name}'`);
    }
}

function evalExpr(src, ctx) {
    const toks = tokenize(src);
    let p = 0;
    const isOp = (v) => toks[p] && toks[p].t === "op" && toks[p].v === v;
    const expect = (v) => { if (!isOp(v)) throw new Error(`expected "${v}" in expression: ${src}`); p++; };
    function or() { let l = and(); while (isOp("||")) { p++; const r = and(); l = truthy(l) ? l : r; } return l; }
    function and() { let l = eq(); while (isOp("&&")) { p++; const r = eq(); l = truthy(l) ? r : l; } return l; }
    function eq() { let l = cmp(); while (isOp("==") || isOp("!=")) { const op = toks[p++].v; const r = cmp(); l = op === "==" ? looseEq(l, r) : !looseEq(l, r); } return l; }
    function cmp() { let l = un(); while (["<", ">", "<=", ">="].some(isOp)) { const op = toks[p++].v; const r = un(); l = compare(l, op, r); } return l; }
    function un() { if (isOp("!")) { p++; return !truthy(un()); } return post(); }
    function post() {
        let v = prim();
        for (;;) {
            if (isOp(".")) {
                p++;
                const t = toks[p++];
                if (!t || !(t.t === "id" || (t.t === "op" && t.v === "*"))) throw new Error(`expected a property name in expression: ${src}`);
                v = t.v === "*" ? (isMap(v) ? Object.values(v) : list(v)) : prop(v, t.v);
            } else if (isOp("[")) {
                p++;
                const k = or();
                expect("]");
                v = prop(v, k);
            } else return v;
        }
    }
    function prim() {
        const t = toks[p++];
        if (!t) throw new Error(`incomplete expression: ${src}`);
        if (t.t === "str" || t.t === "num") return t.v;
        if (t.t === "op" && t.v === "(") { const v = or(); expect(")"); return v; }
        if (t.t === "id") {
            if (isOp("(")) {
                p++;
                const args = [];
                if (!isOp(")")) { do { args.push(or()); } while (isOp(",") && ++p); }
                expect(")");
                return callFn(t.v, args, ctx);
            }
            if (t.v === "true") return true;
            if (t.v === "false") return false;
            if (t.v === "null") return null;
            if (!Object.hasOwn(ctx, t.v)) throw new Error(`Unrecognized named-value: '${t.v}'`);
            return ctx[t.v];
        }
        throw new Error(`unexpected "${t.v}" in expression: ${src}`);
    }
    const v = or();
    if (p < toks.length) throw new Error(`unexpected "${toks[p].v}" in expression: ${src}`);
    return v;
}

const WHOLE = /^\s*\$\{\{([\s\S]*?)\}\}\s*$/;

// A value as the runner sees it: "${{ x }}" alone keeps x's type, anything else becomes a string.
function interpolate(value, ctx) {
    if (typeof value !== "string" || !value.includes("${{")) return value;
    const whole = value.match(WHOLE);
    if (whole && !whole[1].includes("}}")) return evalExpr(whole[1], ctx);
    return value.replace(/\$\{\{([\s\S]*?)\}\}/g, (_, e) => toStr(evalExpr(e, ctx)));
}

// `if:` of a job or step: an expression with or without ${{ }}, wrapped in success() && (...)
// unless it calls a status function itself.
function ifPasses(cond, ctx) {
    if (cond === undefined || cond === null) return truthy(callFn("success", [], ctx));
    let src = typeof cond === "string" ? cond : toStr(cond);
    const whole = src.match(WHOLE);
    if (whole) src = whole[1];
    if (!/\b(success|failure|always|cancelled)\s*\(/i.test(src)) src = `success() && (${src})`;
    return truthy(evalExpr(src, ctx));
}

// ---- Workflow model.
function loadWorkflow(source) {
    const wf = parseYaml(source);
    if (!isMap(wf)) throw new Error("the file must be a map with on: and jobs:");
    if (wf.on === undefined || wf.on === null) throw new Error("no on: (the workflow never runs)");
    if (!isMap(wf.jobs) || !Object.keys(wf.jobs).length) throw new Error("no jobs: map");
    for (const [ev, cfg] of Object.entries(onOf(wf))) {
        for (const k of ["branches", "tags", "paths"]) {
            if (cfg[k] != null && cfg[`${k}-ignore`] != null) throw new Error(`on.${ev}: use ${k} or ${k}-ignore, not both`);
        }
    }
    for (const [id, job] of Object.entries(wf.jobs)) {
        if (!isMap(job)) throw new Error(`job "${id}" must be a map`);
        for (const n of list(job.needs)) if (!wf.jobs[n]) throw new Error(`job "${id}" needs unknown job "${n}"`);
        if (job.uses) continue;
        if (!job["runs-on"]) throw new Error(`job "${id}": runs-on is required`);
        if (!Array.isArray(job.steps) || !job.steps.length) throw new Error(`job "${id}": steps must be a non-empty list`);
        job.steps.forEach((s, i) => {
            if (!isMap(s)) throw new Error(`job "${id}" step ${i + 1} must be a map`);
            if (Boolean(s.uses) === Boolean(s.run)) throw new Error(`job "${id}" step ${i + 1}: needs exactly one of uses: or run:`);
            if (s.uses && !/^(\.\/|docker:\/\/)|^[\w.-]+\/[\w./-]+@[\w./-]+$/.test(String(s.uses))) {
                throw new Error(`job "${id}" step ${i + 1}: uses must be owner/repo@ref, ./path or docker://image (got "${s.uses}")`);
            }
        });
    }
    jobWaves(wf);
    return wf;
}

function onOf(wf) {
    const on = wf.on;
    if (typeof on === "string") return { [on]: {} };
    if (Array.isArray(on)) return Object.fromEntries(on.map((e) => [String(e), {}]));
    if (isMap(on)) return Object.fromEntries(Object.entries(on).map(([k, v]) => [k, isMap(v) ? v : {}]));
    return {};
}

// GitHub filter patterns: * (not /), ** (anything), ?, and ! to negate; the last match wins.
function globRe(pattern) {
    let re = "";
    for (let i = 0; i < pattern.length; i++) {
        const c = pattern[i];
        if (c === "*" && pattern[i + 1] === "*") {
            if (pattern[i + 2] === "/") { re += "(?:.*/)?"; i += 2; } else { re += ".*"; i++; }
        } else if (c === "*") re += "[^/]*";
        else if (c === "?") re += "[^/]";
        else re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    }
    return new RegExp(`^${re}$`);
}

function matches(patterns, value) {
    let hit = false;
    for (const raw of list(patterns).map(String)) {
        const neg = raw.startsWith("!");
        if (globRe(neg ? raw.slice(1) : raw).test(value)) hit = !neg;
    }
    return hit;
}

function refFilter(inc, exc, name) {
    if (inc != null) return matches(inc, name);
    if (exc != null) return !matches(exc, name);
    return true;
}

function pathFilter(cfg, files) {
    if (cfg.paths != null) return files.some((f) => matches(cfg.paths, f));
    if (cfg["paths-ignore"] != null) return files.some((f) => !matches(cfg["paths-ignore"], f));
    return true;
}

// event: { name, ref?: "refs/heads/x" | "refs/tags/x", base?: PR base branch, action?, files?: changed paths }
function triggers(wf, ev) {
    const cfg = onOf(wf)[ev.name];
    if (!cfg) return false;
    const files = ev.files || [];
    if (ev.name === "pull_request" || ev.name === "pull_request_target") {
        const types = cfg.types != null ? list(cfg.types).map(String) : ["opened", "synchronize", "reopened"];
        if (!types.includes(ev.action || "opened")) return false;
        return refFilter(cfg.branches, cfg["branches-ignore"], ev.base) && pathFilter(cfg, files);
    }
    if (ev.name === "push") {
        const tag = String(ev.ref).startsWith("refs/tags/");
        const name = String(ev.ref).replace(/^refs\/(heads|tags)\//, "");
        const [inc, exc, oInc, oExc] = tag ? ["tags", "tags-ignore", "branches", "branches-ignore"] : ["branches", "branches-ignore", "tags", "tags-ignore"];
        const has = (k) => cfg[k] !== undefined && cfg[k] !== null;
        // Only branches (or only tags) filtered: pushes of the other kind do not run the workflow.
        if (!has(inc) && !has(exc) && (has(oInc) || has(oExc))) return false;
        if (!refFilter(cfg[inc], cfg[exc], name)) return false;
        return tag ? true : pathFilter(cfg, files);
    }
    return true;
}

// Jobs grouped in the order they can start: [[no needs], [needs only the first wave], ...].
function jobWaves(wf) {
    const ids = Object.keys(wf.jobs);
    const done = new Set();
    const waves = [];
    while (done.size < ids.length) {
        const wave = ids.filter((id) => !done.has(id) && list(wf.jobs[id].needs).every((n) => done.has(n)));
        if (!wave.length) throw new Error(`jobs depend on each other in a cycle: ${ids.filter((id) => !done.has(id)).join(", ")}`);
        wave.forEach((id) => done.add(id));
        waves.push(wave);
    }
    return waves;
}

// Matrix combinations (axes, then exclude, then include), as in "Running variations of jobs".
function expandMatrix(job, ctx = {}) {
    const strategy = job.strategy;
    if (!isMap(strategy) || strategy.matrix === undefined || strategy.matrix === null) return [null];
    const matrix = interpolate(strategy.matrix, ctx);
    if (!isMap(matrix)) throw new Error("strategy.matrix must be a map");
    const axes = Object.entries(matrix).filter(([k]) => k !== "include" && k !== "exclude");
    for (const [k, v] of axes) if (!Array.isArray(v) || !v.length) throw new Error(`matrix.${k} must be a non-empty list`);
    let combos = axes.length ? [{}] : [];
    for (const [k, vals] of axes) combos = combos.flatMap((c) => vals.map((v) => ({ ...c, [k]: v })));
    for (const ex of list(matrix.exclude)) {
        combos = combos.filter((c) => !Object.entries(ex).every(([k, v]) => Object.hasOwn(c, k) && looseEq(c[k], v)));
    }
    const originals = combos.map((c) => ({ ...c }));
    for (const inc of list(matrix.include)) {
        if (!isMap(inc)) throw new Error("matrix.include entries must be maps");
        let added = false;
        originals.forEach((orig, i) => {
            if (Object.entries(inc).some(([k, v]) => Object.hasOwn(orig, k) && !looseEq(orig[k], v))) return;
            Object.assign(combos[i], inc);
            added = true;
        });
        if (!added) combos.push({ ...inc });
    }
    if (!combos.length) throw new Error("the matrix has no combinations");
    return combos;
}

const matrixLabel = (combo) => (combo ? Object.entries(combo).map(([k, v]) => `${k}=${toStr(v)}`).join(" ") : "");

// GITHUB_TOKEN scopes of a job: job permissions, else workflow permissions, else the restricted
// repository default (contents and packages read). A map grants only the scopes it names.
const SCOPES = ["actions", "attestations", "checks", "contents", "deployments", "discussions", "id-token", "issues",
    "models", "packages", "pages", "pull-requests", "repository-projects", "security-events", "statuses"];
function permissionsOf(wf, job) {
    const p = job && job.permissions !== undefined ? job.permissions : wf.permissions;
    if (p === undefined || p === null) return { contents: "read", packages: "read" };
    if (p === "read-all") return Object.fromEntries(SCOPES.filter((s) => s !== "id-token").map((s) => [s, "read"]));
    if (p === "write-all") return Object.fromEntries(SCOPES.map((s) => [s, "write"]));
    if (!isMap(p)) throw new Error(`permissions must be read-all, write-all or a map (got "${toStr(p)}")`);
    for (const [k, v] of Object.entries(p)) {
        if (!SCOPES.includes(k)) throw new Error(`unknown permission scope "${k}"`);
        if (!["read", "write", "none"].includes(v)) throw new Error(`permission ${k} must be read, write or none`);
    }
    return Object.fromEntries(Object.entries(p).filter(([, v]) => v !== "none"));
}

// Working directory of a run step: the step's, else the job's defaults, else the workflow's.
function workingDirectory(wf, job, step) {
    const d = (o) => (o && isMap(o.defaults) && isMap(o.defaults.run) ? o.defaults.run["working-directory"] : undefined);
    return String(step["working-directory"] ?? d(job) ?? d(wf) ?? ".");
}

const actionName = (uses) => String(uses).replace(/@.*$/, "");
// ==== end of the shared core ====================================================================

// ---- Checks of chal_coding_gha_162: Rice Rocket's web deploy workflow after the security review.
// input: { checks: [...], event?: { name, ref, files }, message?: "<head commit message>" }
// Output: { <check>: value } for each requested check. "parse" is "ok" or the first error.
//   token        GITHUB_TOKEN scopes of the workflow default and of each job (core permissionsOf)
//   aws-auth     per job: "oidc" (role-to-assume + id-token: write in that job), "stored-keys"
//                (access key inputs), "none", or the error configure-aws-credentials would hit
//   cloud-keys   secrets the file reads whose names look like long-lived cloud keys
//   unpinned     `uses:` of actions not owned by GitHub (owners other than actions/ and github/)
//                whose ref is not a full 40-character commit SHA
//   injection    run scripts that put an untrusted github.event field inside ${{ }}
//   log          renders the "Log the release" step for input.message: does the message text land
//                in the shell script (injected) or only in an environment variable?
//   steps        for input.event: the deploy job's steps when the workflow runs, else []
const UNTRUSTED = /github\.(head_ref|event\.(head_commit\.(message|author\.(name|email))|commits|pull_request\.(title|body|head\.(ref|label))|issue\.(title|body)|comment\.body|review\.body|review_comment\.body|discussion\.(title|body)|pages))/;
const CLOUD_KEY = /(ACCESS_KEY|SECRET_KEY|KEY_ID|SECRET_ACCESS|CLIENT_SECRET)/i;

function strings(v, out = []) {
    if (typeof v === "string") out.push(v);
    else if (Array.isArray(v)) v.forEach((x) => strings(x, out));
    else if (isMap(v)) Object.values(v).forEach((x) => strings(x, out));
    return out;
}

function stepLabel(wf, job, step) {
    if (step.name) return String(step.name);
    if (step.uses) return actionName(step.uses);
    return `${workingDirectory(wf, job, step)}$ ${String(step.run).trim()}`;
}

function awsAuth(wf, job) {
    const step = list(job.steps).find((s) => s.uses && actionName(s.uses) === "aws-actions/configure-aws-credentials");
    if (!step) return "none";
    const w = isMap(step.with) ? step.with : {};
    if (w["aws-access-key-id"] || w["aws-secret-access-key"]) return "stored-keys";
    if (!w["role-to-assume"]) return "none";
    if (permissionsOf(wf, job)["id-token"] !== "write") return "error: no OIDC token (the job lacks id-token: write)";
    if (!w["aws-region"]) return "error: aws-region is required";
    return "oidc";
}

function unpinned(wf) {
    const out = [];
    for (const job of Object.values(wf.jobs)) {
        for (const s of list(job.steps)) {
            if (!s.uses || /^(\.\/|docker:\/\/)/.test(String(s.uses))) continue;
            const [name, ref] = String(s.uses).split("@");
            if (/^(actions|github)\//.test(name)) continue;
            if (!/^[0-9a-f]{40}$/.test(ref)) out.push(String(s.uses));
        }
    }
    return out;
}

function injections(wf) {
    const out = [];
    for (const [id, job] of Object.entries(wf.jobs)) {
        for (const s of list(job.steps)) {
            if (!s.run) continue;
            const exprs = [...String(s.run).matchAll(/\$\{\{([\s\S]*?)\}\}/g)].map((m) => m[1]);
            if (exprs.some((e) => UNTRUSTED.test(e))) out.push(`${id}: ${stepLabel(wf, job, s)}`);
        }
    }
    return out;
}

function logStep(wf, message) {
    const ctx = {
        github: { event_name: "push", ref: "refs/heads/main", event: { head_commit: { message } } },
        env: {}, secrets: {}, vars: {}, runner: { os: "Linux" }, steps: {}, job: {}, inputs: {}, matrix: null, needs: {},
    };
    for (const job of Object.values(wf.jobs)) {
        const step = list(job.steps).find((s) => s.name === "Log the release" && s.run);
        if (!step) continue;
        const script = toStr(interpolate(String(step.run), ctx));
        return { injected: script.includes(message) };
    }
    return 'no run step named "Log the release"';
}

async function __harness(input) {
    let wf = null;
    let error = null;
    try {
        wf = loadWorkflow(__source);
    } catch (e) {
        error = e.message;
    }
    const out = {};
    for (const check of input.checks) {
        if (check === "parse") { out.parse = error ? `error: ${error}` : "ok"; continue; }
        if (error) { out[check] = false; continue; }
        try {
            if (check === "token") {
                out.token = { workflow: permissionsOf(wf, null) };
                for (const [id, job] of Object.entries(wf.jobs)) out.token[id] = permissionsOf(wf, job);
            } else if (check === "aws-auth") {
                out[check] = Object.fromEntries(Object.entries(wf.jobs).map(([id, job]) => [id, awsAuth(wf, job)]));
            } else if (check === "cloud-keys") {
                const names = strings(wf).flatMap((s) => [...s.matchAll(/secrets\.([A-Za-z0-9_]+)/g)].map((m) => m[1]));
                out[check] = [...new Set(names.filter((n) => CLOUD_KEY.test(n)))];
            } else if (check === "unpinned") out[check] = unpinned(wf);
            else if (check === "injection") out[check] = injections(wf);
            else if (check === "log") out[check] = logStep(wf, input.message);
            else if (check === "steps") {
                out[check] = triggers(wf, input.event)
                    ? Object.fromEntries(Object.entries(wf.jobs).map(([id, job]) => [id, list(job.steps).map((s) => stepLabel(wf, job, s))]))
                    : [];
            } else out[check] = `unknown check ${check}`;
        } catch (e) {
            out[check] = `error: ${e.message}`;
        }
    }
    return out;
}
