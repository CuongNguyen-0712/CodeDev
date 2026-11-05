// Harness: simulates `docker compose up` (and `down` + `up`) of the learner's compose file (the
// global __source) for Rice Rocket: services db (postgres:17), migrate (the api image running the
// migrations once) and api.
// input: { checks: ["parse", "boot", ...] }
// Output: { <check>: value } for each requested check. "parse" is "ok" or the first error.

// ---- A small YAML subset: block maps and lists by indentation, "- key: value" items, plain and
// quoted scalars, inline [a, "b"] lists and {a: b} maps, comments. No anchors, no block scalars.
function parseYaml(text) {
    const lines = [];
    text.replace(/\r\n?/g, "\n").split("\n").forEach((raw, i) => {
        const lead = raw.match(/^[ \t]*/)[0];
        const body = stripComment(raw.slice(lead.length)).trimEnd();
        if (body === "" || body === "---") return;
        if (lead.includes("\t")) throw new Error(`line ${i + 1}: tabs are not allowed for indentation`);
        lines.push({ no: i + 1, indent: lead.length, text: body });
    });
    let pos = 0;
    const fail = (line, msg) => { throw new Error(`line ${line.no}: ${msg}`); };
    const KEY = /^("(?:[^"\\]|\\.)*"|'[^']*'|[^\s"'#\[{][^:]*?)\s*:(?:\s+(.*))?$/;
    const isItem = (t) => t === "-" || t.startsWith("- ");

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
                obj[key] = scalar(m[2], line);
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
                arr.push(scalar(rest, line));
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
    if (s.startsWith('"')) return s.slice(1, -1).replace(/\\(.)/g, "$1");
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
    if (s === "|" || s === ">" || /^[|>][-+]?$/.test(s)) fail("block scalars (| and >) are not supported here");
    return s;
}

// ---- The Compose model.
const isMap = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const DATA_DIR = "/var/lib/postgresql/data";

function envOf(svc) {
    const env = svc.environment;
    if (Array.isArray(env)) {
        return Object.fromEntries(env.map((item) => {
            const s = String(item);
            const i = s.indexOf("=");
            return i < 0 ? [s, null] : [s.slice(0, i), s.slice(i + 1)];
        }));
    }
    return isMap(env) ? Object.fromEntries(Object.entries(env).map(([k, v]) => [k, v === null ? null : String(v)])) : {};
}

function dependsOf(svc) {
    const deps = svc.depends_on;
    if (Array.isArray(deps)) return Object.fromEntries(deps.map((d) => [String(d), "service_started"]));
    if (isMap(deps)) return Object.fromEntries(Object.entries(deps).map(([k, v]) => [k, (isMap(v) && v.condition) || "service_started"]));
    return {};
}

function volumesOf(svc) {
    return (Array.isArray(svc.volumes) ? svc.volumes : []).map((v) => {
        if (isMap(v)) return { type: v.type || "volume", source: v.source || null, target: String(v.target || "").replace(/\/+$/, "") };
        const parts = String(v).split(":");
        if (parts.length === 1) return { type: "volume", source: null, target: parts[0].replace(/\/+$/, "") };
        const source = parts[0];
        return { type: /^[./~]/.test(source) ? "bind" : "volume", source, target: parts[1].replace(/\/+$/, "") };
    });
}

function portsOf(svc) {
    return (Array.isArray(svc.ports) ? svc.ports : []).map((p) => {
        if (isMap(p)) return { ip: p.host_ip || null, published: p.published ? String(p.published) : null, target: String(p.target) };
        let s = String(p).replace(/\/(tcp|udp)$/, "");
        let ip = null;
        const v6 = s.match(/^\[([^\]]+)\]:(.*)$/);
        if (v6) { ip = v6[1]; s = v6[2]; }
        const parts = s.split(":");
        if (parts.length === 3) { ip = parts[0]; parts.shift(); }
        return parts.length === 2 ? { ip, published: parts[0] || null, target: parts[1] } : { ip, published: null, target: parts[0] };
    });
}

function secretsOf(svc) {
    return (Array.isArray(svc.secrets) ? svc.secrets : []).map((s) => (isMap(s) ? String(s.source) : String(s)));
}

function urlParts(url) {
    const m = String(url || "").match(/^postgres(?:ql)?:\/\/(?:([^@/]*)@)?(\[[^\]]+\]|[^:/?]+)/);
    return m ? { userinfo: m[1] || "", host: m[2] } : null;
}

function load(source) {
    const doc = parseYaml(source);
    if (!isMap(doc) || !isMap(doc.services)) throw new Error("no top-level services: map");
    const services = doc.services;
    const volumes = isMap(doc.volumes) ? doc.volumes : {};
    const secrets = isMap(doc.secrets) ? doc.secrets : {};
    for (const [name, svc] of Object.entries(services)) {
        if (!isMap(svc)) throw new Error(`service "${name}" must be a map`);
        for (const dep of Object.keys(dependsOf(svc))) {
            if (!services[dep]) throw new Error(`service "${name}" depends on undefined service "${dep}"`);
        }
        for (const v of volumesOf(svc)) {
            if (v.type === "volume" && v.source && !Object.hasOwn(volumes, v.source)) {
                throw new Error(`service "${name}" refers to undefined volume ${v.source}`);
            }
        }
        for (const s of secretsOf(svc)) {
            if (!Object.hasOwn(secrets, s)) throw new Error(`service "${name}" refers to undefined secret ${s}`);
        }
    }
    return { services, volumes, secrets };
}

const has = (v) => v !== undefined && v !== null && String(v) !== "";

function healthcheckTest(svc) {
    const hc = svc && svc.healthcheck;
    if (!isMap(hc) || String(hc.disable) === "true") return "";
    const test = Array.isArray(hc.test) ? hc.test.join(" ") : String(hc.test || "");
    return /^NONE\b/.test(test) ? "" : test;
}

function simulate({ services }) {
    const ran = {};
    // Does `name` find Postgres up when it connects (straight after Compose starts it)?
    function dbReadyFor(name, seen) {
        const deps = dependsOf(services[name]);
        if (deps.db === "service_healthy") return true;
        for (const [dep, cond] of Object.entries(deps)) {
            if (dep !== "db" && cond === "service_completed_successfully" && !seen.has(dep) && connect(dep, new Set([...seen, name])) === "ok") return true;
        }
        return false;
    }
    function connect(name, seen = new Set()) {
        if (ran[name]) return ran[name];
        const svc = services[name];
        if (!svc) return `no service "${name}"`;
        const url = envOf(svc).DATABASE_URL;
        const parts = urlParts(url);
        let result;
        if (!has(url)) result = "DATABASE_URL is not set";
        else if (!parts) result = `invalid DATABASE_URL "${url}"`;
        else if (["localhost", "127.0.0.1", "[::1]", "0.0.0.0"].includes(parts.host)) result = "connect ECONNREFUSED 127.0.0.1:5432";
        else if (!services[parts.host]) result = `getaddrinfo ENOTFOUND ${parts.host}`;
        else if (parts.host !== "db") result = `connect ECONNREFUSED ${parts.host}:5432`;
        else if (!dbReadyFor(name, seen)) result = "connect ECONNREFUSED db:5432 (Postgres was still starting)";
        else result = "ok";
        return (ran[name] = result);
    }
    function boot() {
        if (!services.db || !services.api || !services.migrate) return "the file must keep the services db, migrate and api";
        for (const [name, svc] of Object.entries(services)) {
            for (const [dep, cond] of Object.entries(dependsOf(svc))) {
                if (cond === "service_healthy" && !healthcheckTest(services[dep])) {
                    return `dependency failed to start: container ${dep} has no healthcheck configured (needed by ${name})`;
                }
            }
        }
        const apiDeps = dependsOf(services.api);
        const migrated = apiDeps.migrate === "service_completed_successfully";
        if (migrated) {
            const m = connect("migrate", new Set(["api"]));
            if (m !== "ok") return `service "migrate" didn't complete successfully: exit 1 (${m})`;
        }
        const c = connect("api");
        if (c !== "ok") return c;
        if (!migrated) return 'relation "orders" does not exist (api started before migrate finished)';
        return "connected";
    }
    return boot();
}

function dataVolume({ services, volumes }) {
    const v = volumesOf(services.db || {}).find((x) => x.target === DATA_DIR);
    if (!v) return { after: "lost", named: false };
    if (v.type === "bind") return { after: "kept", named: false };
    if (!v.source) return { after: "lost", named: false };
    return { after: "kept", named: Object.hasOwn(volumes, v.source) };
}

function publicPorts({ services }) {
    const out = [];
    for (const [name, svc] of Object.entries(services)) {
        for (const p of portsOf(svc)) {
            if (!p.ip || ["0.0.0.0", "::", "[::]"].includes(p.ip)) out.push(`${name}:${p.published || "random"}->${p.target}`);
        }
    }
    return out;
}

function noInlineSecrets({ services }) {
    for (const svc of Object.values(services)) {
        for (const [k, v] of Object.entries(envOf(svc))) {
            if (/(PASSWORD|SECRET|TOKEN)$/.test(k) && has(v)) return false;
            if (/URL$/.test(k) && urlParts(v) && urlParts(v).userinfo.includes(":")) return false;
        }
    }
    const db = services.db || {};
    const env = envOf(db);
    if (String(env.POSTGRES_HOST_AUTH_METHOD || "").toLowerCase() === "trust") return false;
    return has(env.POSTGRES_PASSWORD_FILE) || has(db.env_file);
}

function secretFilesMounted({ services, secrets }) {
    for (const svc of Object.values(services)) {
        const mounted = secretsOf(svc);
        for (const [k, v] of Object.entries(envOf(svc))) {
            if (!/_FILE$/.test(k) || !has(v)) continue;
            const m = String(v).match(/^\/run\/secrets\/([^/]+)$/);
            if (!m || !mounted.includes(m[1])) return false;
        }
        for (const s of mounted) {
            const def = secrets[s];
            if (!isMap(def) || !(has(def.file) || has(def.environment))) return false;
        }
    }
    return true;
}

async function __harness(input) {
    let project = null;
    let error = null;
    try {
        project = load(__source);
    } catch (e) {
        error = e.message;
    }
    const out = {};
    for (const check of input.checks) {
        if (check === "parse") { out.parse = error ? `error: ${error}` : "ok"; continue; }
        if (error) { out[check] = false; continue; }
        const { services } = project;
        if (check === "boot") out.boot = simulate(project);
        else if (check === "data-after-down") out[check] = dataVolume(project).after;
        else if (check === "db-named-volume") out[check] = dataVolume(project).named;
        else if (check === "db-healthcheck") out[check] = /\bpg_isready\b/.test(healthcheckTest(services.db));
        else if (check === "public-ports") out[check] = publicPorts(project);
        else if (check === "migrate-waits") out[check] = services.migrate ? dependsOf(services.migrate).db || null : null;
        else if (check === "api-waits") {
            const deps = services.api ? dependsOf(services.api) : {};
            out[check] = { db: deps.db || null, migrate: deps.migrate || null };
        } else if (check === "database-url-host") {
            const host = (name) => (services[name] && urlParts(envOf(services[name]).DATABASE_URL) || {}).host || null;
            out[check] = { api: host("api"), migrate: host("migrate") };
        } else if (check === "no-inline-secrets") out[check] = noInlineSecrets(project);
        else if (check === "secret-files-mounted") out[check] = secretFilesMounted(project);
        else out[check] = `unknown check ${check}`;
    }
    return out;
}
