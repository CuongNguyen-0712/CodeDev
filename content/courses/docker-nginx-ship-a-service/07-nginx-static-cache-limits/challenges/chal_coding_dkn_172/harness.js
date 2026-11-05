// Harness: simulates how nginx answers requests with the learner's default.conf (the global
// __source). default.conf is included in the http context, so top-level directives are http-level.
// input:  { files: ["/index.html", "/assets/index-4f9a2c.js", ...],   paths under root
//           requests: [{ path, t?, ip? }],   t = seconds since the first request (default 0)
//           fields?: ["status", "file", ...] }
// output: one result per request, in order:
//   { status, file, cacheControl, gzip, limited, nosniff }
//   file          the file served (after try_files / index / internal redirects), or null
//   cacheControl  the Cache-Control nginx adds (expires + add_header), classified as
//                 "long" (max-age >= 30 days), "short" (other max-age > 0), "revalidate"
//                 (no-cache, no-store or max-age=0), "other", or null when there is none
//   gzip          the response would be gzip-compressed (client sends Accept-Encoding: gzip)
//   limited       the request was rejected by limit_req
//   nosniff       "X-Content-Type-Options: nosniff" is in the response
// A config nginx would reject returns { error }.
//
// Modelled from the nginx docs:
// - location: "=" exact, then the longest prefix; "^~" stops the search; else regexes in order.
// - try_files: each file in order ("$uri/" = a directory, served through index.html); the last
//   parameter is "=code" or an internal redirect to that URI, which picks a location again.
// - expires and add_header only apply to 200, 201, 204, 206, 301-304, 307, 308 (add_header ...
//   always: every status). add_header is inherited from the outer level only if the current
//   level has no add_header; expires, gzip, gzip_types, root, limit_req_status: innermost wins.
// - gzip: text/html is always in gzip_types. proxied api responses are application/json.
// - limit_req: the leaky bucket of ngx_http_limit_req_module with its integer arithmetic:
//   rate in milli-requests per second (10r/m -> 166), excess -= rate * elapsed_ms / 1000, +1000
//   per request, reject when excess > burst * 1000; a rejected request does not change the state.
//   Rejected requests answer limit_req_status (default 503).
// shortcut: first server block only, no nested locations, no rewrite/if/named locations; several
//   limit_req in one location are checked independently; gzip reported for 200 responses only;
//   files are assumed larger than gzip_min_length; "$uri/" is a directory when any listed file is
//   under it. Enough for a single-site default.conf.

const SUCCESS = [200, 201, 204, 206, 301, 302, 303, 304, 307, 308];
const TYPES = {
    html: ["text/html"], js: ["application/javascript", "text/javascript"], mjs: ["application/javascript", "text/javascript"],
    css: ["text/css"], json: ["application/json"], svg: ["image/svg+xml"], png: ["image/png"], jpg: ["image/jpeg"],
    webp: ["image/webp"], ico: ["image/x-icon"], woff2: ["font/woff2"], txt: ["text/plain"], webmanifest: ["application/manifest+json"],
};

function tokenize(s) {
    const tokens = [];
    let i = 0;
    while (i < s.length) {
        const c = s[i];
        if (/\s/.test(c)) { i++; continue; }
        if (c === "#") { while (i < s.length && s[i] !== "\n") i++; continue; }
        if (c === "{" || c === "}" || c === ";") { tokens.push({ t: c }); i++; continue; }
        let v = "";
        if (c === '"' || c === "'") {
            let j = i + 1;
            while (j < s.length && s[j] !== c) {
                if (s[j] === "\\" && j + 1 < s.length) { v += s[j + 1]; j += 2; continue; }
                v += s[j++];
            }
            if (j >= s.length) throw new Error("unterminated quoted string");
            tokens.push({ t: "word", v });
            i = j + 1;
            continue;
        }
        while (i < s.length && !/[\s{};]/.test(s[i])) v += s[i++];
        tokens.push({ t: "word", v });
    }
    return tokens;
}

function parseBlock(tokens, pos, depth) {
    const nodes = [];
    while (pos.i < tokens.length) {
        const tk = tokens[pos.i];
        if (tk.t === "}") {
            if (depth === 0) throw new Error('unexpected "}"');
            pos.i++;
            return nodes;
        }
        if (tk.t !== "word") throw new Error(`unexpected "${tk.t}"`);
        const words = [];
        while (pos.i < tokens.length && tokens[pos.i].t === "word") words.push(tokens[pos.i++].v);
        const end = tokens[pos.i++];
        if (!end) throw new Error('unexpected end of file, expecting ";" or "}"');
        const node = { name: words[0], args: words.slice(1) };
        if (end.t === "{") node.block = parseBlock(tokens, pos, depth + 1);
        else if (end.t !== ";") throw new Error(`unexpected "${end.t}"`);
        nodes.push(node);
    }
    if (depth > 0) throw new Error('unexpected end of file, expecting "}"');
    return nodes;
}

function seconds(value) {
    const m = /^(-?\d+)(ms|s|m|h|d|w|M|y)?$/.exec(value || "");
    if (!m) throw new Error(`invalid time "${value}"`);
    const n = Number(m[1]);
    const unit = { ms: 0.001, s: 1, m: 60, h: 3600, d: 86400, w: 604800, M: 2592000, y: 31536000 }[m[2] || "s"];
    return n * unit;
}

function load(text) {
    const top = parseBlock(tokenize(text), { i: 0 }, 0);
    const httpBlock = top.find((n) => n.name === "http" && n.block);
    const http = httpBlock ? httpBlock.block : top;
    for (const n of http) {
        if (["location", "proxy_pass", "try_files", "limit_req"].includes(n.name)) throw new Error(`"${n.name}" directive is not allowed here`);
    }
    const zones = {};
    for (const n of http.filter((x) => x.name === "limit_req_zone")) {
        const key = n.args[0];
        const zone = (n.args.find((a) => a.startsWith("zone=")) || "").slice(5).split(":")[0];
        const rate = /^rate=(\d+)r\/(s|m)$/.exec(n.args.find((a) => a.startsWith("rate=")) || "");
        if (!key || !zone || !rate) throw new Error("invalid limit_req_zone: expected key, zone=name:size and rate=Nr/s or Nr/m");
        if (zones[zone]) throw new Error(`duplicate zone "${zone}"`);
        // ngx_http_limit_req_zone: rate = n * 1000 / scale, integer
        zones[zone] = { key, rate: Math.floor((Number(rate[1]) * 1000) / (rate[2] === "m" ? 60 : 1)), nodes: new Map() };
    }
    const server = http.find((n) => n.name === "server" && n.block);
    if (!server) throw new Error("no server block");
    const seen = new Set();
    const locations = [];
    for (const n of server.block.filter((x) => x.name === "location")) {
        if (!n.block) throw new Error('"location" needs a block');
        const [a, b] = n.args;
        const loc = ["=", "~", "~*", "^~"].includes(a) ? { mod: a, pattern: b } : { mod: "", pattern: a };
        if (!loc.pattern) throw new Error("invalid location");
        if (loc.pattern.startsWith("@")) throw new Error("named locations are not supported by this simulator");
        const id = (loc.mod === "^~" ? "" : loc.mod) + " " + loc.pattern;
        if (seen.has(id)) throw new Error(`duplicate location "${loc.pattern}"`);
        seen.add(id);
        if (loc.mod.startsWith("~")) {
            try { loc.re = new RegExp(loc.pattern, loc.mod === "~*" ? "i" : ""); } catch { throw new Error(`invalid regex "${loc.pattern}"`); }
        }
        loc.block = n.block;
        locations.push(loc);
    }
    const cfg = { http, server: server.block, locations, zones };
    // Validate the directives the simulator reads, so a typo fails like `nginx -t` would.
    for (const level of [http, server.block, ...locations.map((l) => l.block)]) {
        for (const n of level) {
            if (n.name === "expires") parseExpires(n.args);
            if (n.name === "limit_req") {
                const zone = (n.args.find((a) => a.startsWith("zone=")) || "").slice(5);
                if (!zones[zone]) throw new Error(`zone "${zone}" is unknown (no limit_req_zone)`);
                const burst = n.args.find((a) => a.startsWith("burst="));
                if (burst && !/^burst=\d+$/.test(burst)) throw new Error(`invalid ${burst}`);
            }
            if (n.name === "limit_req_status" && !/^[45]\d\d$/.test(n.args[0] || "")) throw new Error("limit_req_status must be 400-599");
            if (n.name === "try_files" && n.args.length < 2) throw new Error('invalid number of arguments in "try_files"');
            if (n.name === "gzip" && !["on", "off"].includes(n.args[0])) throw new Error('"gzip" must be "on" or "off"');
        }
    }
    return cfg;
}

// expires -> the Cache-Control value nginx adds, or null.
function parseExpires(args) {
    const a = args.filter((x) => x !== "modified");
    const v = a[0];
    if (!v) throw new Error('invalid number of arguments in "expires"');
    if (v === "off") return null;
    if (v === "epoch") return "no-cache";
    if (v === "max") return "max-age=315360000";
    if (v.startsWith("@")) return "max-age=86400"; // shortcut: time of day treated as "within a day"
    const s = seconds(v);
    return s < 0 ? "no-cache" : `max-age=${Math.floor(s)}`;
}

function matchLocation(locations, uri) {
    const exact = locations.find((l) => l.mod === "=" && l.pattern === uri);
    if (exact) return exact;
    let best = null;
    for (const l of locations) {
        if ((l.mod === "" || l.mod === "^~") && uri.startsWith(l.pattern) && (!best || l.pattern.length > best.pattern.length)) best = l;
    }
    if (best && best.mod === "^~") return best;
    const regex = locations.find((l) => l.re && l.re.test(uri));
    return regex || best;
}

function simple(levels, name) {
    for (let i = levels.length - 1; i >= 0; i--) {
        const found = levels[i].filter((n) => n.name === name);
        if (found.length) return found[found.length - 1].args;
    }
    return null;
}

function array(levels, name) {
    for (let i = levels.length - 1; i >= 0; i--) {
        const found = levels[i].filter((n) => n.name === name);
        if (found.length) return found.map((n) => n.args);
    }
    return [];
}

function classify(values) {
    if (!values.length) return null;
    const v = values.join(", ").toLowerCase();
    if (/no-cache|no-store/.test(v)) return "revalidate";
    const m = /max-age=(\d+)/.exec(v);
    if (!m) return "other";
    const age = Number(m[1]);
    return age === 0 ? "revalidate" : age >= 2592000 ? "long" : "short";
}

// One limit_req check: true = accepted. Mirrors ngx_http_limit_req_lookup (account = 1).
function takeToken(zone, key, burst, nowMs) {
    const node = zone.nodes.get(key);
    if (!node) {
        zone.nodes.set(key, { excess: 0, last: nowMs });
        return true;
    }
    let ms = nowMs - node.last;
    if (ms < 0) ms = 0;
    let excess = node.excess - Math.trunc((zone.rate * ms) / 1000) + 1000;
    if (excess < 0) excess = 0;
    if (excess > burst * 1000) return false;
    node.excess = excess;
    if (ms) node.last = nowMs;
    return true;
}

function handle(cfg, files, req) {
    const ip = req.ip || "203.0.113.7";
    const nowMs = Math.round((req.t || 0) * 1000);
    let uri = req.path.split("?")[0];
    let first = true;
    for (let hop = 0; hop < 10; hop++) {
        const loc = matchLocation(cfg.locations, uri);
        const own = loc ? loc.block : cfg.server;
        const levels = loc ? [cfg.http, cfg.server, loc.block] : [cfg.http, cfg.server];
        const respond = (status, file, type) => {
            const ok = SUCCESS.includes(status);
            const cache = [];
            const exp = simple(levels, "expires");
            if (ok && exp) { const v = parseExpires(exp); if (v) cache.push(v); }
            let nosniff = false;
            for (const [name = "", value = "", flag] of array(levels, "add_header")) {
                if (!ok && flag !== "always") continue;
                if (name.toLowerCase() === "cache-control" && value) cache.push(value);
                if (name.toLowerCase() === "x-content-type-options" && value.toLowerCase() === "nosniff") nosniff = true;
            }
            const gzipOn = (simple(levels, "gzip") || ["off"])[0] === "on";
            const gzipTypes = ["text/html", ...(simple(levels, "gzip_types") || [])];
            const gzip = status === 200 && gzipOn && Boolean(type) && (gzipTypes.includes("*") || type.some((t) => gzipTypes.includes(t)));
            return { status, file, cacheControl: classify(cache), gzip, limited: false, nosniff };
        };

        // limit_req runs in the preaccess phase, once per request (not again after internal redirects).
        if (first) {
            first = false;
            for (const args of array(levels, "limit_req")) {
                const zone = cfg.zones[args.find((a) => a.startsWith("zone=")).slice(5)];
                const burst = Number((args.find((a) => a.startsWith("burst=")) || "burst=0").slice(6));
                const keyName = zone.key.replace(/^\$/, "");
                const key = keyName === "binary_remote_addr" || keyName === "remote_addr" ? ip : zone.key;
                if (!takeToken(zone, key, burst, nowMs)) {
                    const status = Number((simple(levels, "limit_req_status") || ["503"])[0]);
                    return { ...respond(status, null, null), limited: true };
                }
            }
        }

        if (loc && loc.block.some((n) => n.name === "proxy_pass")) return respond(200, null, TYPES.json);

        const typeOf = (f) => TYPES[(f.split("/").pop().split(".").pop() || "").toLowerCase()] || ["application/octet-stream"];
        const isDir = (d) => files.some((f) => f.startsWith(d.replace(/\/+$/, "") + "/"));
        const tryFiles = own.find((n) => n.name === "try_files");
        let next = null;
        if (tryFiles) {
            const params = tryFiles.args.map((a) => a.replace(/\$uri/g, uri).replace(/\/{2,}/g, "/"));
            const fallback = params.pop();
            let found = null;
            for (const p of params) {
                if (p.endsWith("/")) {
                    if (isDir(p)) { found = { dir: p }; break; }
                } else if (files.includes(p)) { found = { file: p }; break; }
            }
            if (found && found.file) return respond(200, found.file, typeOf(found.file));
            if (found && found.dir) {
                const index = found.dir.replace(/\/+$/, "") + "/index.html";
                if (!files.includes(index)) return respond(403, null, null);
                next = index;
            } else if (fallback.startsWith("=")) {
                return respond(Number(fallback.slice(1)), null, null);
            } else {
                next = fallback;
            }
        } else if (uri.endsWith("/")) {
            const index = uri + "index.html";
            if (files.includes(index)) next = index;
            else return respond(isDir(uri) ? 403 : 404, null, null);
        } else if (files.includes(uri)) {
            return respond(200, uri, typeOf(uri));
        } else {
            return respond(404, null, null);
        }
        uri = next.split("?")[0];
    }
    return { status: 500, file: null, cacheControl: null, gzip: false, limited: false, nosniff: false }; // redirection cycle
}

async function __harness(input) {
    let cfg;
    try {
        cfg = load(__source);
    } catch (e) {
        return { error: e.message };
    }
    try {
        return input.requests.map((req) => {
            const full = handle(cfg, input.files, req);
            if (!input.fields) return full;
            const picked = {};
            for (const f of input.fields) picked[f] = full[f];
            return picked;
        });
    } catch (e) {
        return { error: e.message };
    }
}
