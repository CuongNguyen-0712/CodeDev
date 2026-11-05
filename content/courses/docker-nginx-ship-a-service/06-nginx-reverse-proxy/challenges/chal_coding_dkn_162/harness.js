// Harness: simulates how nginx routes requests through the learner's default.conf (the global
// __source). default.conf is included in the http context, so top-level directives are http-level.
// input:  { requests: [{ path, clientIp, scheme, host? }], fields?: ["to", "upstreamPath", ...] }
// output: one result per request:
//   { to: "api" | "static" | 404 | "unreachable <host:port>", upstreamPath, headers, readTimeoutSec }
//   headers = { Host, "X-Real-IP", "X-Forwarded-For", "X-Forwarded-Proto" } as sent to the api
//   (null when the header is not sent). A config nginx would reject returns { error }.
//
// Modelled from the nginx docs (ngx_http_core_module, ngx_http_proxy_module):
// - location: "=" exact, then the longest prefix; "^~" on that prefix stops the search; otherwise
//   regexes (~, ~*) in file order, first match wins; else the longest prefix.
// - proxy_pass with a URI part replaces the matched location prefix; without one the request URI
//   is passed unchanged. A URI part in a regex location is a config error.
// - proxy_set_header is inherited from the outer level only if the current level has none;
//   Host defaults to $proxy_host. proxy_read_timeout defaults to 60s, inner level wins.
// shortcut: first server block only, no nested locations, no rewrite/if; enough for one-site configs.

const DEFAULT_HOST = "ricerocket.vn";
const API = "api:3000";

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

function load(text) {
    const top = parseBlock(tokenize(text), { i: 0 }, 0);
    const httpBlock = top.find((n) => n.name === "http" && n.block);
    const http = httpBlock ? httpBlock.block : top;
    for (const n of http) {
        if (n.name === "location") throw new Error('"location" directive is not allowed here');
        if (n.name === "proxy_pass") throw new Error('"proxy_pass" directive is not allowed here');
    }
    const upstreams = {};
    for (const n of http.filter((x) => x.name === "upstream")) {
        if (!n.block) throw new Error('"upstream" needs a block');
        if (upstreams[n.args[0]]) throw new Error(`duplicate upstream "${n.args[0]}"`);
        upstreams[n.args[0]] = n.block.filter((x) => x.name === "server").map((x) => withPort(x.args[0]));
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
        const id = (loc.mod === "^~" ? "" : loc.mod) + " " + loc.pattern;
        if (seen.has(id)) throw new Error(`duplicate location "${loc.pattern}"`);
        seen.add(id);
        if (loc.mod.startsWith("~")) {
            try { loc.re = new RegExp(loc.pattern, loc.mod === "~*" ? "i" : ""); } catch { throw new Error(`invalid regex "${loc.pattern}"`); }
        }
        loc.block = n.block;
        locations.push(loc);
    }
    const cfg = { http, server: server.block, locations, upstreams };
    for (const loc of locations) {
        const pp = loc.block.find((x) => x.name === "proxy_pass");
        if (pp) loc.proxy = parseProxyPass(pp.args[0], loc, upstreams);
    }
    return cfg;
}

const withPort = (hostport) => (/:\d+$/.test(hostport) ? hostport : `${hostport}:80`);

function parseProxyPass(url, loc, upstreams) {
    const m = /^http:\/\/([^/:]+)(?::(\d+))?(\/.*)?$/.exec(url || "");
    if (!m) throw new Error(`invalid URL prefix in "${url}"`);
    const [, host, port, uri] = m;
    if (uri !== undefined && loc.re) {
        throw new Error('"proxy_pass" cannot have URI part in location given by regular expression');
    }
    let servers;
    if (upstreams[host]) {
        if (port) throw new Error(`upstream "${host}" may not have port ${port}`);
        servers = upstreams[host];
    } else servers = [`${host}:${port || 80}`];
    return { servers, uri, proxyHost: port && port !== "80" ? `${host}:${port}` : host };
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

// Innermost level that defines the directive wins (proxy_read_timeout, ...).
function simple(levels, name) {
    for (let i = levels.length - 1; i >= 0; i--) {
        const found = levels[i].filter((n) => n.name === name);
        if (found.length) return found[found.length - 1].args;
    }
    return null;
}

// Array directives (proxy_set_header): all entries of the innermost level that has any.
function array(levels, name) {
    for (let i = levels.length - 1; i >= 0; i--) {
        const found = levels[i].filter((n) => n.name === name);
        if (found.length) return found.map((n) => n.args);
    }
    return [];
}

function seconds(value) {
    const m = /^(\d+)(ms|s|m|h|d)?$/.exec(value || "");
    if (!m) throw new Error(`invalid time "${value}"`);
    const n = Number(m[1]);
    return { ms: n / 1000, s: n, m: n * 60, h: n * 3600, d: n * 86400 }[m[2] || "s"];
}

function substitute(value, vars) {
    return value.replace(/\$(?:\{(\w+)\}|(\w+))/g, (_, a, b) => {
        const name = a || b;
        if (name in vars) return vars[name];
        if (name.startsWith("http_")) return "";
        throw new Error(`unknown "${name}" variable`);
    });
}

function route(cfg, req) {
    const [path, args] = req.path.split("?");
    const loc = matchLocation(cfg.locations, path);
    if (!loc) return { to: 404, upstreamPath: null, headers: null, readTimeoutSec: null };
    if (!loc.proxy) return { to: "static", upstreamPath: null, headers: null, readTimeoutSec: null };

    const { servers, uri, proxyHost } = loc.proxy;
    const upstreamPath = uri === undefined
        ? req.path
        : uri + path.slice(loc.mod === "=" ? path.length : loc.pattern.length) + (args !== undefined ? `?${args}` : "");

    const levels = [cfg.http, cfg.server, loc.block];
    const host = req.host || DEFAULT_HOST;
    const vars = {
        host: host.split(":")[0].toLowerCase(),
        http_host: host,
        remote_addr: req.clientIp,
        proxy_add_x_forwarded_for: req.xForwardedFor ? `${req.xForwardedFor}, ${req.clientIp}` : req.clientIp,
        http_x_forwarded_for: req.xForwardedFor || "",
        scheme: req.scheme,
        proxy_host: proxyHost,
        server_port: req.scheme === "https" ? "443" : "80",
        request_uri: req.path,
        uri: path,
        args: args || "",
    };
    const sent = { host: substitute("$proxy_host", vars) };
    for (const [name, value = ""] of array(levels, "proxy_set_header")) {
        sent[name.toLowerCase()] = substitute(value, vars);
    }
    const header = (name) => (sent[name.toLowerCase()] ? sent[name.toLowerCase()] : null);
    const timeout = simple(levels, "proxy_read_timeout");

    return {
        to: servers.includes(API) ? "api" : `unreachable ${servers.join(",")}`,
        upstreamPath,
        headers: {
            Host: header("Host"),
            "X-Real-IP": header("X-Real-IP"),
            "X-Forwarded-For": header("X-Forwarded-For"),
            "X-Forwarded-Proto": header("X-Forwarded-Proto"),
        },
        readTimeoutSec: timeout ? seconds(timeout[0]) : 60,
    };
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
            const full = route(cfg, req);
            if (!input.fields) return full;
            const picked = {};
            for (const f of input.fields) picked[f] = full[f];
            return picked;
        });
    } catch (e) {
        return { error: e.message };
    }
}
