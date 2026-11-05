// ==== Terraform plan simulator: shared core =====================================================
// The same block opens every harness.js of the terraform-infra-as-code course; the checks of each
// challenge follow it. It models documented Terraform behaviour (developer.hashicorp.com), not
// real providers: an HCL subset, expressions and functions, variables (types, defaults,
// validation, sensitive), locals, count / for_each, modules, moved and import blocks, lifecycle,
// and a plan against a prior state and the real-world objects (drift).

// ---- HCL tokens.
const UNKNOWN = Object.freeze({ unknown: true, toString: () => "(known after apply)" });
const isUnknown = (v) => v === UNKNOWN;
// Namespaces (var, local, module, data, resource types) are Proxies that resolve on access.
const NS = Symbol("namespace");
const namespace = (get) => new Proxy({}, { get: (_, k) => (k === NS ? true : typeof k === "string" ? get(k) : undefined), has: () => true });
const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v) && !(v instanceof Set) && v !== UNKNOWN;

function hclTokens(src) {
    const toks = [];
    const text = String(src).replace(/\r\n?/g, "\n");
    let i = 0;
    let line = 1;
    const push = (t, v, extra) => toks.push({ t, v, line, ...extra });
    const fail = (msg) => { throw new Error(`line ${line}: ${msg}`); };
    while (i < text.length) {
        const c = text[i];
        if (c === "\n") { push("nl"); line++; i++; continue; }
        if (c === " " || c === "\t") { i++; continue; }
        if (c === "#" || (c === "/" && text[i + 1] === "/")) { while (i < text.length && text[i] !== "\n") i++; continue; }
        if (c === "/" && text[i + 1] === "*") {
            const end = text.indexOf("*/", i + 2);
            if (end < 0) fail("unterminated /* comment");
            line += (text.slice(i, end).match(/\n/g) || []).length;
            i = end + 2;
            continue;
        }
        if (c === '"') {
            const parts = [];
            let buf = "";
            i++;
            for (;;) {
                if (i >= text.length || text[i] === "\n") fail("unterminated string");
                const ch = text[i];
                if (ch === '"') { i++; break; }
                if (ch === "\\") {
                    const n = text[i + 1];
                    buf += n === "n" ? "\n" : n === "t" ? "\t" : n;
                    i += 2;
                    continue;
                }
                if (ch === "$" && text[i + 1] === "$" && text[i + 2] === "{") { buf += "${"; i += 3; continue; }
                if (ch === "$" && text[i + 1] === "{") {
                    if (buf) parts.push(buf);
                    buf = "";
                    let depth = 1, j = i + 2, quote = false;
                    for (; j < text.length && depth; j++) {
                        if (text[j] === '"' && text[j - 1] !== "\\") quote = !quote;
                        else if (!quote && text[j] === "{") depth++;
                        else if (!quote && text[j] === "}") depth--;
                    }
                    if (depth) fail("unterminated ${ in a string");
                    parts.push({ expr: text.slice(i + 2, j - 1), line });
                    i = j;
                    continue;
                }
                if (ch === "%" && text[i + 1] === "{") fail("template directives (%{ }) are not supported here");
                buf += ch;
                i++;
            }
            if (buf || !parts.length) parts.push(buf);
            push("str", parts);
            continue;
        }
        if (c === "<" && text[i + 1] === "<") {
            const m = text.slice(i).match(/^<<(-?)([A-Za-z_][A-Za-z0-9_]*)\n/);
            if (!m) fail("a heredoc starts with <<EOT or <<-EOT followed by a newline");
            const body = [];
            let j = i + m[0].length;
            let l = line + 1;
            for (;;) {
                if (j >= text.length) fail(`heredoc ${m[2]} has no closing ${m[2]} line`);
                const nl = text.indexOf("\n", j);
                const row = text.slice(j, nl < 0 ? text.length : nl);
                j = nl < 0 ? text.length : nl + 1;
                if (row.trim() === m[2]) break;
                body.push(row);
                l++;
            }
            let rows = body;
            if (m[1]) {
                const ind = Math.min(...rows.filter((r) => r.trim()).map((r) => r.match(/^ */)[0].length));
                rows = rows.map((r) => r.slice(Number.isFinite(ind) ? ind : 0));
            }
            push("str", [rows.join("\n") + "\n"]);
            line = l + 1;
            i = j;
            push("nl");
            continue;
        }
        const num = text.slice(i).match(/^\d+(\.\d+)?([eE][-+]?\d+)?/);
        if (num) { push("num", Number(num[0])); i += num[0].length; continue; }
        const id = text.slice(i).match(/^[A-Za-z_][A-Za-z0-9_-]*/);
        if (id) { push("id", id[0]); i += id[0].length; continue; }
        const three = text.slice(i, i + 3);
        if (three === "...") { push("op", three); i += 3; continue; }
        const two = text.slice(i, i + 2);
        if (["==", "!=", "<=", ">=", "&&", "||", "=>"].includes(two)) { push("op", two); i += 2; continue; }
        if ("{}[]()=,.:?!<>+-*/%".includes(c)) { push("op", c); i++; continue; }
        fail(`unexpected character "${c}"`);
    }
    push("eof");
    return toks;
}

// ---- HCL parser: a body is attributes and blocks; expressions become small ASTs.
function parseHcl(src) {
    const toks = hclTokens(src);
    let p = 0;
    let depth = 0; // inside ( [ { of an expression newlines are insignificant
    const peek = () => { if (depth) while (toks[p].t === "nl") p++; return toks[p]; };
    const next = () => { const t = peek(); p++; return t; };
    const isOp = (v) => { const t = peek(); return t.t === "op" && t.v === v; };
    const fail = (t, msg) => { throw new Error(`line ${t.line}: ${msg}`); };
    const expect = (v) => { const t = next(); if (!(t.t === "op" && t.v === v)) fail(t, `expected "${v}"${t.t === "eof" ? " before the end of the file" : `, got "${t.t === "nl" ? "newline" : Array.isArray(t.v) ? "a string" : t.v}"`}`); return t; };

    function body(closing) {
        const attrs = {};
        const blocks = [];
        for (;;) {
            const t = toks[p];
            if (t.t === "nl") { p++; continue; }
            if (closing && t.t === "op" && t.v === "}") { p++; break; }
            if (t.t === "eof") { if (closing) fail(t, 'missing "}" to close a block'); break; }
            if (t.t !== "id") fail(t, `expected an attribute or a block, got "${Array.isArray(t.v) ? "a string" : t.v}"`);
            p++;
            const n = toks[p];
            if (n.t === "op" && n.v === "=") {
                p++;
                if (Object.hasOwn(attrs, t.v)) fail(t, `the argument "${t.v}" was already set`);
                attrs[t.v] = { ...expr(), line: t.line };
                const end = toks[p];
                if (!(end.t === "nl" || end.t === "eof" || (closing && end.t === "op" && end.v === "}"))) fail(end, "expected a newline after the argument");
                continue;
            }
            const labels = [];
            while (toks[p].t === "str" || toks[p].t === "id") {
                const l = toks[p++];
                if (l.t === "str" && (l.v.length !== 1 || typeof l.v[0] !== "string")) fail(l, "block labels cannot use ${ }");
                labels.push(l.t === "str" ? l.v[0] : l.v);
            }
            if (!(toks[p].t === "op" && toks[p].v === "{")) fail(toks[p], `expected "=" or "{" after "${t.v}"`);
            p++;
            const inner = body(true);
            blocks.push({ type: t.v, labels, ...inner, line: t.line });
        }
        return { attrs, blocks };
    }

    function expr() { return cond(); }
    function cond() {
        const c = bin(0);
        if (!isOp("?")) return c;
        next();
        const a = expr();
        expect(":");
        const b = expr();
        return { k: "cond", c, a, b };
    }
    const LEVELS = [["||"], ["&&"], ["==", "!="], ["<", ">", "<=", ">="], ["+", "-"], ["*", "/", "%"]];
    function bin(level) {
        if (level === LEVELS.length) return unary();
        let l = bin(level + 1);
        while (LEVELS[level].some(isOp)) { const op = next().v; const r = bin(level + 1); l = { k: "bin", op, l, r }; }
        return l;
    }
    function unary() {
        if (isOp("!")) { next(); return { k: "not", e: unary() }; }
        if (isOp("-")) { next(); return { k: "neg", e: unary() }; }
        return postfix(primary());
    }
    function postfix(e) {
        for (;;) {
            if (isOp(".")) {
                next();
                const t = next();
                if (t.t === "id") e = { k: "attr", e, name: t.v };
                else if (t.t === "num") e = { k: "index", e, i: { k: "lit", v: t.v } };
                else if (t.t === "op" && t.v === "*") e = { k: "splat", e };
                else fail(t, "expected an attribute name after \".\"");
            } else if (isOp("[")) {
                next();
                depth++;
                if (isOp("*")) { next(); expect("]"); depth--; e = { k: "splat", e }; continue; }
                const i = expr();
                expect("]");
                depth--;
                e = { k: "index", e, i };
            } else return e;
        }
    }
    function primary() {
        const t = next();
        if (t.t === "num") return { k: "lit", v: t.v };
        if (t.t === "str") return { k: "tpl", parts: t.v.map((part) => (typeof part === "string" ? part : parseExprText(part.expr, part.line))) };
        if (t.t === "op" && t.v === "(") { depth++; const e = expr(); expect(")"); depth--; return e; }
        if (t.t === "op" && t.v === "[") return tupleOrFor();
        if (t.t === "op" && t.v === "{") return objectOrFor();
        if (t.t === "id") {
            if (t.v === "true") return { k: "lit", v: true };
            if (t.v === "false") return { k: "lit", v: false };
            if (t.v === "null") return { k: "lit", v: null };
            if (isOp("(")) {
                next();
                depth++;
                const args = [];
                let expand = false;
                while (!isOp(")")) {
                    args.push(expr());
                    if (isOp("...")) { next(); expand = true; }
                    if (!isOp(")")) expect(",");
                }
                expect(")");
                depth--;
                return { k: "call", name: t.v, args, expand, line: t.line };
            }
            return { k: "ref", name: t.v, line: t.line };
        }
        fail(t, `expected an expression, got "${t.t === "nl" ? "newline" : t.t === "eof" ? "end of file" : t.v}"`);
    }
    function forHead() {
        next(); // for
        const a = next().v;
        let b = null;
        if (isOp(",")) { next(); b = next().v; }
        const inTok = next();
        if (inTok.v !== "in") fail(inTok, 'expected "in" in a for expression');
        const coll = expr();
        expect(":");
        return { a, b, coll };
    }
    function tupleOrFor() {
        depth++;
        if (peek().t === "id" && peek().v === "for") {
            const h = forHead();
            const value = expr();
            let filter = null;
            if (peek().t === "id" && peek().v === "if") { next(); filter = expr(); }
            expect("]");
            depth--;
            return { k: "forList", ...h, value, filter };
        }
        const items = [];
        while (!isOp("]")) { items.push(expr()); if (!isOp("]")) expect(","); }
        expect("]");
        depth--;
        return { k: "tuple", items };
    }
    function objectOrFor() {
        depth++;
        if (peek().t === "id" && peek().v === "for") {
            const h = forHead();
            const key = expr();
            expect("=>");
            const value = expr();
            let group = false;
            if (isOp("...")) { next(); group = true; }
            let filter = null;
            if (peek().t === "id" && peek().v === "if") { next(); filter = expr(); }
            expect("}");
            depth--;
            return { k: "forObject", ...h, key, value, filter, group };
        }
        const items = [];
        while (!isOp("}")) {
            const kt = peek();
            let key;
            if (kt.t === "id" && (toks[p + 1].v === "=" || toks[p + 1].v === ":")) { next(); key = { k: "lit", v: kt.v }; } else key = expr();
            if (isOp("=") || isOp(":")) next(); else fail(peek(), 'expected "=" after an object key');
            items.push([key, expr()]);
            if (isOp(",")) next();
        }
        expect("}");
        depth--;
        return { k: "object", items };
    }
    return body(false);
}

function parseExprText(text, line) {
    const parsed = parseHcl(`__x = ${text}\n`);
    const e = parsed.attrs.__x;
    if (!e) throw new Error(`line ${line}: invalid expression in \${ }`);
    return e;
}

// A traversal expression as a dotted address (moved/import/depends_on): aws_s3_bucket.web["a"].
function traversal(e) {
    if (!e) throw new Error("expected a resource address");
    if (e.k === "ref") return e.name;
    if (e.k === "attr") return `${traversal(e.e)}.${e.name}`;
    if (e.k === "index" && e.i.k === "lit") return `${traversal(e.e)}[${JSON.stringify(e.i.v)}]`;
    if (e.k === "index" && e.i.k === "tpl" && e.i.parts.length === 1 && typeof e.i.parts[0] === "string") return `${traversal(e.e)}[${JSON.stringify(e.i.parts[0])}]`;
    throw new Error("expected a static resource address (no expressions)");
}

// ---- Values and functions.
function tfType(v) {
    if (v === null) return "null";
    if (isUnknown(v)) return "unknown";
    if (typeof v === "string") return "string";
    if (typeof v === "number") return "number";
    if (typeof v === "boolean") return "bool";
    if (v instanceof Set) return "set";
    if (Array.isArray(v)) return "list";
    return "object";
}

function toStr(v) {
    if (typeof v === "string") return v;
    if (typeof v === "number" || typeof v === "boolean") return String(v);
    if (v === null) throw new Error("Invalid template interpolation value: the expression result is null");
    throw new Error(`Invalid template interpolation value: cannot include a ${tfType(v)} in a string`);
}

function containsUnknown(v) {
    if (isUnknown(v)) return true;
    if (Array.isArray(v)) return v.some(containsUnknown);
    if (v instanceof Set) return [...v].some(containsUnknown);
    if (isObj(v)) return Object.values(v).some(containsUnknown);
    return false;
}

const toSet = (arr) => new Set([...arr].map((x) => (typeof x === "number" || typeof x === "boolean" ? String(x) : x)).sort());

const FUNCS = {
    length: (v) => (typeof v === "string" ? v.length : v instanceof Set ? v.size : Array.isArray(v) ? v.length : Object.keys(v).length),
    upper: (s) => toStr(s).toUpperCase(),
    lower: (s) => toStr(s).toLowerCase(),
    title: (s) => toStr(s).replace(/\b\w/g, (c) => c.toUpperCase()),
    trimspace: (s) => toStr(s).trim(),
    replace: (s, a, b) => toStr(s).split(toStr(a)).join(toStr(b)),
    substr: (s, o, n) => toStr(s).substr(o, n < 0 ? undefined : n),
    startswith: (s, x) => toStr(s).startsWith(toStr(x)),
    endswith: (s, x) => toStr(s).endsWith(toStr(x)),
    format: (f, ...a) => { let k = 0; return toStr(f).replace(/%[sd%]/g, (m) => (m === "%%" ? "%" : toStr(a[k++]))); },
    join: (sep, l) => [...l].map(toStr).join(toStr(sep)),
    split: (sep, s) => toStr(s).split(toStr(sep)),
    concat: (...ls) => ls.flatMap((l) => [...l]),
    contains: (l, v) => [...l].some((x) => x === v),
    keys: (m) => Object.keys(m).sort(),
    values: (m) => Object.keys(m).sort().map((k) => m[k]),
    merge: (...ms) => Object.assign({}, ...ms.filter((m) => m !== null)),
    lookup: (m, k, d) => { if (Object.hasOwn(m, k)) return m[k]; if (d === undefined) throw new Error(`Invalid function argument: the given key "${k}" does not exist in the map`); return d; },
    tomap: (m) => ({ ...m }),
    tolist: (l) => [...l],
    toset: (l) => toSet(l),
    tostring: (v) => toStr(v),
    tonumber: (v) => { const n = Number(v); if (Number.isNaN(n)) throw new Error(`Invalid function argument: cannot convert "${v}" to number`); return n; },
    min: (...a) => Math.min(...a),
    max: (...a) => Math.max(...a),
    coalesce: (...a) => { const v = a.find((x) => x !== null && x !== ""); if (v === undefined) throw new Error("Invalid function argument: no non-null, non-empty-string arguments"); return v; },
    jsonencode: (v) => JSON.stringify(v instanceof Set ? [...v] : v),
    flatten: (l) => [...l].flatMap((x) => (Array.isArray(x) ? FUNCS.flatten(x) : [x])),
    distinct: (l) => [...new Set(l)],
    can: () => true,
};

// ---- Evaluation. ctx: { lookup(rootName) -> value, each?, count?, locals for "for" }.
function evaluate(e, ctx) {
    switch (e.k) {
        case "lit": return e.v;
        case "tpl": {
            if (e.parts.length === 1 && typeof e.parts[0] !== "string") return evaluate(e.parts[0], ctx);
            let out = "";
            for (const part of e.parts) {
                if (typeof part === "string") { out += part; continue; }
                const v = evaluate(part, ctx);
                if (containsUnknown(v)) return UNKNOWN;
                out += toStr(v);
            }
            return out;
        }
        case "tuple": return e.items.map((x) => evaluate(x, ctx));
        case "object": {
            const out = {};
            for (const [k, v] of e.items) {
                const key = k.k === "ref" ? k.name : evaluate(k, ctx);
                if (isUnknown(key)) return UNKNOWN;
                out[toStr(key)] = evaluate(v, ctx);
            }
            return out;
        }
        case "ref": {
            if (ctx.scope && Object.hasOwn(ctx.scope, e.name)) return ctx.scope[e.name];
            return ctx.lookup(e.name, e.line);
        }
        case "attr": {
            const base = evaluate(e.e, ctx);
            if (isUnknown(base)) return UNKNOWN;
            if (Array.isArray(base) && base.__splat) return base.map((x) => (isUnknown(x) ? UNKNOWN : getAttr(x, e.name, e)));
            return getAttr(base, e.name, e);
        }
        case "index": {
            const base = evaluate(e.e, ctx);
            const i = evaluate(e.i, ctx);
            if (isUnknown(base) || isUnknown(i)) return UNKNOWN;
            if (Array.isArray(base)) {
                if (typeof i !== "number" || !(i in base)) throw new Error(`Invalid index: the given index ${JSON.stringify(i)} is out of range for a list of ${base.length}`);
                return base[i];
            }
            if (isObj(base)) {
                if (!Object.hasOwn(base, toStr(i))) throw new Error(`Invalid index: the given key ${JSON.stringify(i)} does not exist`);
                return base[toStr(i)];
            }
            throw new Error(`Invalid index: a ${tfType(base)} cannot be indexed`);
        }
        case "splat": {
            const base = evaluate(e.e, ctx);
            if (isUnknown(base)) return UNKNOWN;
            const arr = Array.isArray(base) ? [...base] : base === null ? [] : [base];
            arr.__splat = true;
            return arr;
        }
        case "cond": {
            const c = evaluate(e.c, ctx);
            if (isUnknown(c)) return UNKNOWN;
            if (typeof c !== "boolean") throw new Error("Invalid condition result: the condition must be a bool");
            return c ? evaluate(e.a, ctx) : evaluate(e.b, ctx);
        }
        case "not": { const v = evaluate(e.e, ctx); return isUnknown(v) ? UNKNOWN : !v; }
        case "neg": { const v = evaluate(e.e, ctx); return isUnknown(v) ? UNKNOWN : -v; }
        case "bin": {
            const l = evaluate(e.l, ctx);
            if (e.op === "&&" && l === false) return false;
            if (e.op === "||" && l === true) return true;
            const r = evaluate(e.r, ctx);
            if (isUnknown(l) || isUnknown(r)) return UNKNOWN;
            switch (e.op) {
                case "==": return JSON.stringify(l) === JSON.stringify(r);
                case "!=": return JSON.stringify(l) !== JSON.stringify(r);
                case "&&": return l && r;
                case "||": return l || r;
                case "<": return l < r;
                case ">": return l > r;
                case "<=": return l <= r;
                case ">=": return l >= r;
                case "+": case "-": case "*": case "/": case "%": {
                    if (typeof l !== "number" || typeof r !== "number") throw new Error(`Invalid operand: arithmetic needs numbers, got ${tfType(l)} and ${tfType(r)}`);
                    return e.op === "+" ? l + r : e.op === "-" ? l - r : e.op === "*" ? l * r : e.op === "/" ? l / r : l % r;
                }
                default: throw new Error(`unsupported operator ${e.op}`);
            }
        }
        case "forList": case "forObject": {
            const coll = evaluate(e.coll, ctx);
            if (isUnknown(coll)) return UNKNOWN;
            const entries = coll instanceof Set ? [...coll].map((v) => [v, v]) : Array.isArray(coll) ? coll.map((v, i) => [i, v]) : Object.keys(coll).sort().map((k) => [k, coll[k]]);
            const out = e.k === "forList" ? [] : {};
            for (const [k, v] of entries) {
                const scope = { ...(ctx.scope || {}), ...(e.b ? { [e.a]: k, [e.b]: v } : { [e.a]: v }) };
                const inner = { ...ctx, scope };
                if (e.filter && !evaluate(e.filter, inner)) continue;
                if (e.k === "forList") out.push(evaluate(e.value, inner));
                else {
                    const key = toStr(evaluate(e.key, inner));
                    const val = evaluate(e.value, inner);
                    if (e.group) (out[key] = out[key] || []).push(val);
                    else if (Object.hasOwn(out, key)) throw new Error(`Duplicate object key: "${key}" (use ... to group)`);
                    else out[key] = val;
                }
            }
            return out;
        }
        case "call": {
            const name = e.name;
            if (name === "try") {
                for (const a of e.args) { try { return evaluate(a, ctx); } catch { /* next */ } }
                throw new Error("Error in function call: no expression succeeded");
            }
            if (name === "can") { try { evaluate(e.args[0], ctx); return true; } catch { return false; } }
            const fn = FUNCS[name];
            if (!fn) throw new Error(`line ${e.line}: Call to unknown function: there is no function named "${name}" in this exercise`);
            let args = e.args.map((a) => evaluate(a, ctx));
            if (e.expand) args = [...args.slice(0, -1), ...args[args.length - 1]];
            if (args.some(containsUnknown)) return UNKNOWN;
            return fn(...args);
        }
        default: throw new Error(`unsupported expression ${e.k}`);
    }
}

function getAttr(base, name, e) {
    if (base && base[NS]) return base[name];
    if (isObj(base)) {
        if (!Object.hasOwn(base, name)) throw new Error(`Unsupported attribute: this object does not have an attribute named "${name}"`);
        return base[name];
    }
    if (Array.isArray(base)) throw new Error(`Unsupported attribute: a list has no attribute "${name}" (did you mean [*].${name} or [0].${name}?)`);
    throw new Error(`Unsupported attribute "${name}" on a ${tfType(base)}`);
}

// ---- Provider schemas (a small subset of hashicorp/aws and hashicorp/random). forceNew
// attributes replace the object when they change; computed ones are known after apply.
const SCHEMAS = {
    aws_s3_bucket: { forceNew: ["bucket"], computed: ["id", "arn", "bucket_domain_name", "bucket_regional_domain_name"] },
    aws_s3_bucket_versioning: { forceNew: ["bucket"], computed: ["id"] },
    aws_s3_bucket_public_access_block: { forceNew: ["bucket"], computed: ["id"] },
    aws_db_instance: { forceNew: ["identifier", "engine", "db_name", "username", "storage_encrypted", "availability_zone"], computed: ["id", "arn", "address", "endpoint", "port"] },
    aws_instance: { forceNew: ["ami", "subnet_id", "availability_zone"], computed: ["id", "arn", "public_ip", "private_ip"] },
    aws_security_group: { forceNew: ["name", "description", "vpc_id"], computed: ["id", "arn"] },
    aws_vpc_security_group_ingress_rule: { forceNew: ["security_group_id", "cidr_ipv4", "from_port", "to_port", "ip_protocol"], computed: ["id", "arn"] },
    aws_ecr_repository: { forceNew: ["name"], computed: ["id", "arn", "repository_url"] },
    aws_iam_role: { forceNew: ["name"], computed: ["id", "arn", "unique_id"] },
    aws_ssm_parameter: { forceNew: ["name"], computed: ["id", "arn", "version"] },
    aws_route53_record: { forceNew: ["zone_id", "name", "type"], computed: ["id", "fqdn"] },
    aws_cloudwatch_log_group: { forceNew: ["name"], computed: ["id", "arn"] },
    aws_dynamodb_table: { forceNew: ["name", "hash_key"], computed: ["id", "arn"] },
    random_password: { forceNew: ["length", "special", "keepers"], computed: ["id", "result"] },
    terraform_data: { forceNew: ["triggers_replace"], computed: ["id", "output"] },
};

// ---- Configuration model.
const META_ARGS = ["count", "for_each", "depends_on", "provider", "lifecycle"];

function loadConfig(source, where = "") {
    const body = parseHcl(source);
    const at = (b) => `${where}line ${b.line}`;
    const cfg = { terraform: [], providers: [], variables: {}, locals: {}, resources: [], data: [], outputs: {}, modules: [], moved: [], imports: [] };
    if (Object.keys(body.attrs).length) {
        const [name, a] = Object.entries(body.attrs)[0];
        throw new Error(`line ${a.line}: unexpected argument "${name}" at the top level (an argument goes inside a block)`);
    }
    const seen = new Set();
    for (const b of body.blocks) {
        const label = (n) => { if (b.labels.length !== n) throw new Error(`${at(b)}: a ${b.type} block needs ${n} label${n === 1 ? "" : "s"}`); };
        if (b.type === "terraform") cfg.terraform.push(b);
        else if (b.type === "provider") { label(1); cfg.providers.push(b); }
        else if (b.type === "variable") {
            label(1);
            if (cfg.variables[b.labels[0]]) throw new Error(`${at(b)}: Duplicate variable declaration "${b.labels[0]}"`);
            cfg.variables[b.labels[0]] = b;
        } else if (b.type === "locals") {
            for (const [k, v] of Object.entries(b.attrs)) {
                if (cfg.locals[k]) throw new Error(`${at(b)}: Duplicate local value definition "${k}"`);
                cfg.locals[k] = v;
            }
        } else if (b.type === "resource" || b.type === "data") {
            label(2);
            const id = `${b.type === "data" ? "data." : ""}${b.labels[0]}.${b.labels[1]}`;
            if (seen.has(id)) throw new Error(`${at(b)}: Duplicate ${b.type} "${b.labels[0]}" configuration "${b.labels[1]}"`);
            seen.add(id);
            if (b.type === "resource" && !SCHEMAS[b.labels[0]]) throw new Error(`${at(b)}: Invalid resource type: the provider does not support resource type "${b.labels[0]}" in this exercise`);
            if (b.attrs.count && b.attrs.for_each) throw new Error(`${at(b)}: Invalid combination of "count" and "for_each"`);
            (b.type === "data" ? cfg.data : cfg.resources).push({ type: b.labels[0], name: b.labels[1], block: b });
        } else if (b.type === "output") { label(1); cfg.outputs[b.labels[0]] = b; }
        else if (b.type === "module") {
            label(1);
            if (!b.attrs.source) throw new Error(`${at(b)}: Missing required argument "source" in module "${b.labels[0]}"`);
            cfg.modules.push({ name: b.labels[0], block: b });
        } else if (b.type === "moved") cfg.moved.push({ from: traversal(b.attrs.from), to: traversal(b.attrs.to), line: b.line });
        else if (b.type === "import") cfg.imports.push({ to: traversal(b.attrs.to), id: b.attrs.id, line: b.line });
        else throw new Error(`${at(b)}: Unsupported block type "${b.type}"`);
    }
    return cfg;
}

const lit = (e) => (e && e.k === "tpl" && e.parts.length === 1 && typeof e.parts[0] === "string" ? e.parts[0] : e && e.k === "lit" ? e.v : null);

// Type constraint check (string, number, bool, any, list(T), set(T), map(T), object({...}), optional).
function convert(value, type, path) {
    if (!type || value === null || isUnknown(value)) return value;
    const t = type;
    const bad = () => { throw new Error(`Invalid value for variable: ${path}: ${typeLabel(t)} required, got ${tfType(value)}`); };
    if (t.k === "ref") {
        if (t.name === "any") return value;
        if (t.name === "string") { if (typeof value === "number" || typeof value === "boolean") return String(value); if (typeof value !== "string") bad(); return value; }
        if (t.name === "number") { if (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value))) return Number(value); if (typeof value !== "number") bad(); return value; }
        if (t.name === "bool") { if (value === "true" || value === "false") return value === "true"; if (typeof value !== "boolean") bad(); return value; }
    }
    if (t.k === "call") {
        const inner = t.args[0];
        if (t.name === "list" || t.name === "set") {
            if (!Array.isArray(value) && !(value instanceof Set)) bad();
            const out = [...value].map((v, i) => convert(v, inner, `${path}[${i}]`));
            return t.name === "set" ? toSet(out) : out;
        }
        if (t.name === "map") {
            if (!isObj(value)) bad();
            return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, convert(v, inner, `${path}["${k}"]`)]));
        }
        if (t.name === "object") {
            if (!isObj(value)) bad();
            const out = {};
            for (const [ke, te] of inner.items) {
                const key = ke.k === "ref" ? ke.name : lit(ke);
                const optional = te.k === "call" && te.name === "optional";
                if (!Object.hasOwn(value, key)) {
                    if (!optional) throw new Error(`Invalid value for variable: ${path}: attribute "${key}" is required`);
                    out[key] = te.args[1] ? evaluate(te.args[1], { lookup: () => null }) : null;
                } else out[key] = convert(value[key], optional ? te.args[0] : te, `${path}.${key}`);
            }
            return out;
        }
    }
    return value;
}

function typeLabel(t) {
    if (!t) return "any";
    if (t.k === "ref") return t.name;
    if (t.k === "call") return `${t.name}(...)`;
    return "value";
}

// ---- Planning. options: { vars, state: { "<addr>": { type, attrs } }, remote: { "<addr>": attrs | null },
// modules: { "<source>": "<hcl text>" }, data: { "<data addr>": attrs } }.
function planConfig(cfg, options = {}) {
    const ctxRoot = { modules: options.modules || {}, data: options.data || {} };
    const instances = []; // { addr, type, block, values (lazy), each, count, module }
    const outputsByModule = {};
    const moduleSensitive = new Set();

    function walk(cfg, prefix, varValues, path) {
        const vars = {};
        const sensitiveVars = new Set();
        for (const [name, b] of Object.entries(cfg.variables)) {
            const type = b.attrs.type;
            let value;
            if (Object.hasOwn(varValues, name) && varValues[name] !== undefined) value = varValues[name];
            else if (b.attrs.default) value = evaluate(b.attrs.default, { lookup: (n) => { throw new Error(`Variables not allowed: a default cannot refer to ${n}`); } });
            else throw new Error(`No value for required variable: ${prefix ? `module ${prefix.slice(0, -1)}: ` : ""}the root module variable "${name}" is not set, and has no default value`.replace("the root module variable", prefix ? "variable" : "the root module variable"));
            value = convert(value, type, `var.${name}`);
            if (b.attrs.nullable && evaluate(b.attrs.nullable, { lookup: () => null }) === false && value === null) throw new Error(`Invalid value for variable: var.${name} must not be null`);
            vars[name] = value;
            if (b.attrs.sensitive && evaluate(b.attrs.sensitive, { lookup: () => null }) === true) sensitiveVars.add(name);
        }
        for (const name of Object.keys(varValues)) {
            if (!cfg.variables[name] && varValues[name] !== undefined) {
                throw new Error(prefix ? `Unsupported argument: an argument named "${name}" is not expected here (module ${prefix.slice(0, -1)} declares no variable "${name}")` : `Value for undeclared variable: a variable named "${name}" was assigned but the root module does not declare it`);
            }
        }
        // Validation blocks.
        for (const [name, b] of Object.entries(cfg.variables)) {
            for (const v of b.blocks.filter((x) => x.type === "validation")) {
                const ok = evaluate(v.attrs.condition, { lookup: (n) => { if (n === "var") return vars; throw new Error(`Invalid reference in variable validation: ${n}`); } });
                if (ok === false) throw new Error(`Invalid value for variable: var.${name}: ${lit(v.attrs.error_message) ?? "validation failed"}`);
            }
        }
        const localCache = {};
        const resourceRoots = {};
        const resourceGetters = {};
        const scope = { prefix, vars, sensitiveVars, cfg };
        const lookup = (name, line) => {
            if (name === "var") return namespace((k) => { if (!Object.hasOwn(vars, k)) throw new Error(`line ${line}: Reference to undeclared input variable "${k}"`); return vars[k]; });
            if (name === "local") return namespace((k) => {
                if (!cfg.locals[k]) throw new Error(`line ${line}: Reference to undeclared local value "${k}"`);
                if (localCache[k] === "busy") throw new Error(`Cycle in local value "${k}"`);
                if (!Object.hasOwn(localCache, k)) { localCache[k] = "busy"; localCache[k] = evaluate(cfg.locals[k], { lookup }); }
                return localCache[k];
            });
            if (name === "module") return namespace((k) => { const out = outputsByModule[`${prefix}module.${k}`]; if (!out) throw new Error(`line ${line}: Reference to undeclared module "${k}"`); return out(); });
            if (name === "data") return namespace((type) => namespace((n) => { const d = cfg.data.find((x) => x.type === type && x.name === n); if (!d) throw new Error(`line ${line}: Reference to undeclared data source "data.${type}.${n}"`); return ctxRoot.data[`${prefix}data.${type}.${n}`] || UNKNOWN; }));
            if (name === "path") return { module: prefix ? `./modules/${prefix}` : ".", root: "." };
            if (name === "terraform") return { workspace: options.workspace || "default" };
            if (name === "each" || name === "count") throw new Error(`line ${line}: Reference to "${name}" in a context without ${name === "each" ? "for_each" : "count"}`);
            if (resourceRoots[name]) return resourceRoots[name];
            if (/^[a-z0-9]+_[a-z0-9_]+$/.test(name)) throw new Error(`line ${line}: Reference to undeclared resource: a resource of type "${name}" is not declared in ${prefix ? `module ${prefix.slice(0, -1)}` : "the root module"}`);
            throw new Error(`line ${line}: Unknown name "${name}"`);
        };
        scope.lookup = lookup;

        for (const r of cfg.resources) {
            const base = `${prefix}${r.type}.${r.name}`;
            const meta = r.block.attrs;
            let keys;
            if (meta.count) {
                const n = evaluate(meta.count, { lookup });
                if (isUnknown(n)) throw new Error(`${base}: Invalid count argument: the "count" value depends on resource attributes that cannot be determined until apply`);
                if (typeof n !== "number" || n < 0 || !Number.isInteger(n)) throw new Error(`${base}: Invalid count argument: must be a whole number >= 0`);
                keys = Array.from({ length: n }, (_, i) => ({ addr: `${base}[${i}]`, count: { index: i } }));
            } else if (meta.for_each) {
                const fe = evaluate(meta.for_each, { lookup });
                if (containsUnknown(fe)) throw new Error(`${base}: Invalid for_each argument: the "for_each" value depends on resource attributes that cannot be determined until apply`);
                if (Array.isArray(fe)) throw new Error(`${base}: Invalid for_each argument: the given "for_each" argument value is unsuitable: the "for_each" argument must be a map, or set of strings, and you have provided a value of type tuple. Convert it with toset()`);
                const entries = fe instanceof Set ? [...fe].map((k) => [k, k]) : isObj(fe) ? Object.keys(fe).sort().map((k) => [k, fe[k]]) : null;
                if (!entries) throw new Error(`${base}: Invalid for_each argument: a map or set of strings is required`);
                keys = entries.map(([k, v]) => ({ addr: `${base}[${JSON.stringify(k)}]`, each: { key: k, value: v } }));
            } else keys = [{ addr: base }];
            const list = keys.map((k) => {
                const inst = { addr: k.addr, type: r.type, block: r.block, scope, each: k.each, count: k.count, module: prefix, resource: base };
                instances.push(inst);
                return inst;
            });
            const valueOf = (inst) => () => instanceValue(inst);
            let rootValue;
            if (meta.count) rootValue = () => list.map((i) => valueOf(i)());
            else if (meta.for_each) rootValue = () => Object.fromEntries(list.map((i) => [i.each.key, valueOf(i)()]));
            else rootValue = valueOf(list[0]);
            const getters = (resourceGetters[r.type] = resourceGetters[r.type] || {});
            getters[r.name] = rootValue;
            if (!resourceRoots[r.type]) {
                const type = r.type;
                resourceRoots[type] = namespace((n) => {
                    if (!resourceGetters[type][n]) throw new Error(`Reference to undeclared resource: "${type}.${n}" is not declared in ${prefix ? `module ${prefix.slice(0, -1)}` : "the root module"}`);
                    return resourceGetters[type][n]();
                });
            }
        }

        for (const m of cfg.modules) {
            const source = lit(m.block.attrs.source);
            if (source === null) throw new Error(`module "${m.name}": source must be a literal string`);
            const text = ctxRoot.modules[source];
            if (text === undefined) throw new Error(`Module not installed: module "${m.name}" source "${source}" is not available in this exercise`);
            const child = loadConfig(text, `${source}: `);
            const args = {};
            for (const [k, e] of Object.entries(m.block.attrs)) {
                if (["source", "version", "providers", "depends_on", "count", "for_each"].includes(k)) continue;
                args[k] = evaluate(e, { lookup });
            }
            const childPrefix = `${prefix}module.${m.name}.`;
            const childScope = walk(child, childPrefix, args, `${path}${m.name}/`);
            outputsByModule[`${prefix}module.${m.name}`] = () => Object.fromEntries(Object.entries(child.outputs).map(([k, b]) => [k, evaluate(b.attrs.value, { lookup: childScope.lookup })]));
            for (const [k, b] of Object.entries(child.outputs)) if (b.attrs.sensitive && evaluate(b.attrs.sensitive, { lookup: () => null }) === true) moduleSensitive.add(`${childPrefix}${k}`);
        }
        return scope;
    }

    const state = options.state || {};
    const remote = options.remote || {};
    const moved = new Map(cfg.moved.map((m) => [m.to, m.from]));
    const plannedCache = new Map();

    function priorOf(addr) {
        if (state[addr]) return { from: addr, obj: state[addr] };
        // A moved block maps a new address to its old one; a resource address moves all instances.
        for (const [to, from] of moved) {
            if (addr === to) return state[from] ? { from, obj: state[from], moved: true } : null;
            if (addr.startsWith(`${to}[`) || addr.startsWith(`${to}.`)) {
                const old = from + addr.slice(to.length);
                if (state[old]) return { from: old, obj: state[old], moved: true };
            }
        }
        return null;
    }

    function configured(inst) {
        const ctx = {
            lookup: (n, line) => {
                if (n === "each") { if (!inst.each) throw new Error(`line ${line}: Reference to "each" in a resource without for_each`); return inst.each; }
                if (n === "count") { if (!inst.count) throw new Error(`line ${line}: Reference to "count" in a resource without count`); return inst.count; }
                if (n === "self") throw new Error(`line ${line}: "self" is only valid in provisioners`);
                return inst.scope.lookup(n, line);
            },
        };
        const attrs = {};
        for (const [k, e] of Object.entries(inst.block.attrs)) if (!META_ARGS.includes(k)) attrs[k] = evaluate(e, ctx);
        for (const nb of inst.block.blocks.filter((b) => b.type !== "lifecycle")) {
            const v = {};
            for (const [k, e] of Object.entries(nb.attrs)) v[k] = evaluate(e, ctx);
            (attrs[nb.type] = attrs[nb.type] || []).push(v);
        }
        return attrs;
    }

    function lifecycleOf(inst) {
        const lc = inst.block.blocks.find((b) => b.type === "lifecycle");
        if (!lc) return {};
        const out = {};
        if (lc.attrs.prevent_destroy) out.prevent_destroy = evaluate(lc.attrs.prevent_destroy, { lookup: () => null }) === true;
        if (lc.attrs.create_before_destroy) out.create_before_destroy = evaluate(lc.attrs.create_before_destroy, { lookup: () => null }) === true;
        if (lc.attrs.ignore_changes) {
            const e = lc.attrs.ignore_changes;
            out.ignore_changes = e.k === "ref" && e.name === "all" ? "all" : (e.items || []).map((x) => traversal(x));
        }
        return out;
    }

    function plannedOf(inst) {
        if (plannedCache.has(inst.addr)) {
            const c = plannedCache.get(inst.addr);
            if (c === "busy") throw new Error(`Cycle: ${inst.addr} refers to itself through its dependencies`);
            return c;
        }
        plannedCache.set(inst.addr, "busy");
        const schema = SCHEMAS[inst.type];
        const attrs = configured(inst);
        const prior = priorOf(inst.addr);
        const imp = cfg.imports.find((i) => i.to === inst.addr);
        const lc = lifecycleOf(inst);
        let action;
        let changed = [];
        let base = null;
        if (prior) base = Object.hasOwn(remote, prior.from) ? remote[prior.from] : prior.obj.attrs;
        if (!prior && imp) {
            const id = evaluate(imp.id, { lookup: (n, line) => inst.scope.lookup(n, line) });
            const found = Object.values(remote).find((o) => o && o.id === id) || (options.importable || {})[id];
            if (!found) throw new Error(`Cannot import non-existent remote object: ${inst.addr} with id "${id}"`);
            base = found;
        }
        if (prior && Object.hasOwn(remote, prior.from) && remote[prior.from] === null) base = null; // deleted outside Terraform
        if (!base) action = "create";
        else {
            const ignore = lc.ignore_changes === "all" ? Object.keys(attrs) : lc.ignore_changes || [];
            changed = Object.keys(attrs).filter((k) => !ignore.includes(k) && !isUnknown(attrs[k]) && JSON.stringify(attrs[k]) !== JSON.stringify(base[k] === undefined ? null : base[k]));
            const unknownChanges = Object.keys(attrs).filter((k) => !ignore.includes(k) && containsUnknown(attrs[k]) && schema.forceNew.includes(k) && base[k] !== undefined);
            if (changed.some((k) => schema.forceNew.includes(k)) || unknownChanges.length) action = "replace";
            else if (changed.length) action = "update";
            else action = "no-op";
            changed = [...new Set([...changed, ...unknownChanges])];
        }
        if (imp && !prior) action = action === "no-op" ? "import" : `import+${action}`;
        if (action === "replace" && lc.prevent_destroy) {
            throw new Error(`Instance cannot be destroyed: resource ${inst.addr} has lifecycle.prevent_destroy set, but the plan calls for this resource to be destroyed (replace: ${changed.join(", ")})`);
        }
        const values = { ...attrs };
        for (const c of schema.computed) {
            values[c] = action === "create" || action === "replace" || action.startsWith("import+replace") ? UNKNOWN : base && base[c] !== undefined ? base[c] : UNKNOWN;
        }
        const result = { addr: inst.addr, type: inst.type, action, changed, moved: Boolean(prior && prior.moved), from: prior ? prior.from : null, values, lifecycle: lc };
        plannedCache.set(inst.addr, result);
        return result;
    }

    function instanceValue(inst) { return plannedOf(inst).values; }

    const rootScope = walk(cfg, "", options.vars || {}, "");
    const changes = instances.map(plannedOf);
    // Objects in state with no configuration (after moved blocks) are destroyed.
    const claimed = new Set(changes.map((c) => c.from).filter(Boolean));
    for (const [addr, obj] of Object.entries(state)) {
        if (claimed.has(addr)) continue;
        if (Object.hasOwn(remote, addr) && remote[addr] === null) continue; // already gone
        const inst = instances.find((i) => i.resource === addr.replace(/\[[^\]]*\]$/, ""));
        if (inst && lifecycleOf(inst).prevent_destroy) throw new Error(`Instance cannot be destroyed: resource ${addr} has lifecycle.prevent_destroy set, but the plan calls for this resource to be destroyed`);
        if (obj.prevent_destroy) throw new Error(`Instance cannot be destroyed: resource ${addr} has lifecycle.prevent_destroy set, but the plan calls for this resource to be destroyed`);
        changes.push({ addr, type: obj.type, action: "delete", changed: [], moved: false, from: addr, values: obj.attrs });
    }
    for (const m of cfg.moved) {
        if (!state[m.from] && !Object.keys(state).some((a) => a.startsWith(`${m.from}[`))) continue;
        if (!changes.some((c) => c.from && (c.from === m.from || c.from.startsWith(`${m.from}[`)) && c.moved)) {
            throw new Error(`Moved object still exists: line ${m.line}: ${m.from} was moved to ${m.to}, but the configuration has no ${m.to}`);
        }
    }
    const outputs = {};
    const sensitiveOutputs = [];
    for (const [name, b] of Object.entries(cfg.outputs)) {
        const sensitive = b.attrs.sensitive && evaluate(b.attrs.sensitive, { lookup: () => null }) === true;
        const refs = refsOf(b.attrs.value);
        const usesSensitive = refs.some((r) => (r.startsWith("var.") && rootScope.sensitiveVars.has(r.slice(4))) || moduleSensitive.has(r));
        if (usesSensitive && !sensitive) throw new Error(`Output refers to sensitive values: output "${name}" includes a sensitive value; set sensitive = true on it`);
        const v = evaluate(b.attrs.value, { lookup: rootScope.lookup });
        outputs[name] = sensitive ? "(sensitive value)" : containsUnknown(v) ? "(known after apply)" : v;
        if (sensitive) sensitiveOutputs.push(name);
    }
    const count = (pred) => changes.filter(pred).length;
    const summary = {
        import: count((c) => c.action.startsWith("import")),
        add: count((c) => c.action === "create" || c.action === "replace" || c.action === "import+replace"),
        change: count((c) => c.action === "update" || c.action === "import+update"),
        destroy: count((c) => c.action === "delete" || c.action === "replace" || c.action === "import+replace"),
    };
    return { changes, outputs, summary, sensitiveOutputs };
}

// Dotted references used by an expression (var.x, module.a.b, aws_x.y.z), for static checks.
function refsOf(e, out = []) {
    if (!e || typeof e !== "object") return out;
    if (e.k === "attr" || e.k === "ref" || e.k === "index") {
        try { out.push(traversal(e)); } catch { /* dynamic index */ }
    }
    for (const v of Object.values(e)) {
        if (Array.isArray(v)) v.forEach((x) => (Array.isArray(x) ? x.forEach((y) => refsOf(y, out)) : refsOf(x, out)));
        else if (v && typeof v === "object" && v.k) refsOf(v, out);
    }
    return out;
}

// Terraform's one-line summary.
const planLine = (s) => (!s.import && !s.add && !s.change && !s.destroy ? "No changes. Your infrastructure matches the configuration." : `Plan: ${s.import ? `${s.import} to import, ` : ""}${s.add} to add, ${s.change} to change, ${s.destroy} to destroy.`);

// Actions keyed by address, sorted ("create" | "update" | "replace" | "delete" | "no-op" | "import...").
const actionsOf = (plan) => Object.fromEntries(plan.changes.map((c) => [c.addr, c.moved && c.action === "no-op" ? `moved from ${c.from}` : c.action]).sort(([a], [b]) => (a < b ? -1 : 1)));
// ==== end of the shared core ====================================================================

// ---- Checks of chal_coding_tf_122: the database plan, read before it is applied.
// input: { checks: [...], vars: { env, db_instance_class? }, state?, remote? }
// state = what Terraform last recorded; remote = the real objects now (drift), as the refresh
// at the start of `terraform plan` sees them.
// "plan" is Terraform's summary line or "Error: <message>"; the other checks read the plan.
async function __harness(input) {
    let cfg = null;
    let error = null;
    try {
        cfg = loadConfig(__source);
    } catch (e) {
        error = e.message;
    }
    let plan = null;
    let planError = null;
    if (cfg) {
        try {
            plan = planConfig(cfg, { vars: input.vars || {}, state: input.state || {}, remote: input.remote || {} });
        } catch (e) {
            planError = e.message;
        }
    }
    const main = () => (plan ? plan.changes.find((c) => c.addr === "aws_db_instance.main") : null);
    const out = {};
    for (const check of input.checks) {
        if (check === "parse") { out.parse = error ? `error: ${error}` : "ok"; continue; }
        if (error) { out[check] = false; continue; }
        if (check === "plan") { out.plan = planError ? `Error: ${planError}` : planLine(plan.summary); continue; }
        if (planError) { out[check] = `Error: ${planError}`; continue; }
        if (check === "actions") out.actions = actionsOf(plan);
        else if (check === "changed") out.changed = main() ? main().changed : null;
        else if (check === "settings") {
            const v = main() ? main().values : {};
            const pick = (k) => (v[k] === UNKNOWN ? "(known after apply)" : v[k] === undefined ? null : v[k]);
            out.settings = {
                identifier: pick("identifier"),
                instance_class: pick("instance_class"),
                max_allocated_storage: pick("max_allocated_storage"),
                deletion_protection: pick("deletion_protection"),
                skip_final_snapshot: pick("skip_final_snapshot"),
                final_snapshot_identifier: pick("final_snapshot_identifier"),
            };
        } else out[check] = `unknown check ${check}`;
    }
    return out;
}
