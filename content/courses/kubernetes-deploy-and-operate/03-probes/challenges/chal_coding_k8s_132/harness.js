// ==== Kubernetes manifest simulator: shared core ================================================
// The same block opens every YAML harness.js of the kubernetes-deploy-and-operate course; the
// checks of each challenge follow it. It models documented Kubernetes behaviour (kubernetes.io),
// not a cluster: multi-document YAML, object validation as `kubectl apply` reports it, label
// selectors, resource quantities, container env from ConfigMaps and Secrets, Service endpoints.

// ---- YAML subset: block maps and lists by indentation, "- key: value" items, plain scalars typed
// as in YAML 1.2 (null, true/false, numbers), quoted strings, inline [..] / {..}, | and > block
// scalars, comments. No anchors; parseDocs splits a file on --- lines.
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


const isMap = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const list = (v) => (Array.isArray(v) ? v : v === undefined || v === null ? [] : [v]);
const str = (v) => (v === undefined || v === null ? "" : String(v));

// "---" starts a new document; empty documents (comments only) are skipped like kubectl does.
function parseDocs(text) {
    const docs = [];
    let chunk = [];
    let offset = 0;
    const flush = () => {
        const body = chunk.join("\n");
        if (!body.replace(/#.*$/gm, "").trim()) return;
        try {
            docs.push(parseYaml(body));
        } catch (e) {
            // Report the line number in the whole file, not in the document.
            throw new Error(e.message.replace(/^line (\d+)/, (_, n) => `line ${Number(n) + offset}`));
        }
    };
    String(text).replace(/\r\n?/g, "\n").split("\n").forEach((line, i) => {
        if (/^(---|\.\.\.)\s*(#.*)?$/.test(line)) { flush(); chunk = []; offset = i + 1; } else chunk.push(line);
    });
    flush();
    return docs;
}

// ---- Objects as `kubectl apply` validates them.
const API_VERSIONS = {
    Namespace: "v1", ConfigMap: "v1", Secret: "v1", Service: "v1", Pod: "v1", ServiceAccount: "v1",
    Deployment: "apps/v1", StatefulSet: "apps/v1", Job: "batch/v1", CronJob: "batch/v1",
    Ingress: "networking.k8s.io/v1", HorizontalPodAutoscaler: "autoscaling/v2", PodDisruptionBudget: "policy/v1",
    Gateway: "gateway.networking.k8s.io/v1", HTTPRoute: "gateway.networking.k8s.io/v1",
};
const POD_OWNERS = {
    Pod: (o) => ({ metadata: o.metadata, spec: o.spec }),
    Deployment: (o) => o.spec.template,
    StatefulSet: (o) => o.spec.template,
    Job: (o) => o.spec.template,
    CronJob: (o) => o.spec.jobTemplate && o.spec.jobTemplate.spec && o.spec.jobTemplate.spec.template,
};

function loadManifests(source) {
    const objs = parseDocs(source);
    if (!objs.length) throw new Error("no objects passed to apply");
    const seen = new Set();
    objs.forEach((o, i) => {
        const where = `document ${i + 1}`;
        if (!isMap(o)) throw new Error(`${where}: an object must be a map`);
        if (!o.kind) throw new Error(`${where}: Object 'Kind' is missing`);
        if (!o.apiVersion) throw new Error(`${where}: apiVersion not set`);
        const expected = API_VERSIONS[o.kind];
        if (!expected) throw new Error(`${where}: kind "${o.kind}" is not part of this exercise`);
        if (o.apiVersion !== expected) throw new Error(`resource mapping not found for kind "${o.kind}" in version "${o.apiVersion}" (use ${expected})`);
        if (!isMap(o.metadata) || !o.metadata.name) throw new Error(`${where}: metadata.name is required`);
        if (!/^[a-z0-9]([-a-z0-9.]*[a-z0-9])?$/.test(str(o.metadata.name))) throw new Error(`${o.kind} "${o.metadata.name}": a name must be lowercase letters, digits, - and .`);
        const id = `${o.kind}/${o.metadata.name}`;
        if (seen.has(id)) throw new Error(`${id} is defined twice`);
        seen.add(id);
        if (o.kind === "Secret" || o.kind === "ConfigMap") return;
        if (!isMap(o.spec)) throw new Error(`${id}: spec is required`);
        if (POD_OWNERS[o.kind]) validatePodOwner(o, id);
    });
    return objs;
}

function validatePodOwner(o, id) {
    const template = POD_OWNERS[o.kind](o);
    if (!isMap(template) || !isMap(template.spec)) throw new Error(`${id}: the pod template (spec.template) is required`);
    const labels = (isMap(template.metadata) && template.metadata.labels) || {};
    if (o.kind === "Deployment" || o.kind === "StatefulSet") {
        if (!isMap(o.spec.selector)) throw new Error(`${id}: spec.selector: Required value`);
        if (!Object.keys(labels).length || !selectorMatches(o.spec.selector, labels)) {
            throw new Error(`${id}: spec.template.metadata.labels: Invalid value: \`selector\` does not match template \`labels\``);
        }
    }
    const containers = list(template.spec.containers);
    if (!containers.length) throw new Error(`${id}: spec.template.spec.containers: Required value`);
    const names = new Set();
    for (const c of [...containers, ...list(template.spec.initContainers)]) {
        if (!isMap(c) || !c.name || !c.image) throw new Error(`${id}: every container needs a name and an image`);
        if (names.has(c.name)) throw new Error(`${id}: container name "${c.name}" is used twice`);
        names.add(c.name);
        for (const p of list(c.ports)) {
            if (!isMap(p) || !Number.isInteger(p.containerPort)) throw new Error(`${id}: container "${c.name}": ports need an integer containerPort`);
            if (p.name !== undefined && !/^[a-z0-9-]{1,15}$/.test(str(p.name))) throw new Error(`${id}: port name "${p.name}" must be 1-15 lowercase letters, digits or -`);
        }
        for (const part of ["requests", "limits"]) {
            const r = (isMap(c.resources) && c.resources[part]) || {};
            if (r.cpu !== undefined && r.cpu !== null) parseCpu(r.cpu);
            if (r.memory !== undefined && r.memory !== null) parseMemory(r.memory);
        }
    }
    const restart = template.spec.restartPolicy;
    if ((o.kind === "Job" || o.kind === "CronJob") && !["Never", "OnFailure"].includes(restart)) {
        throw new Error(`${id}: spec.template.spec.restartPolicy: Unsupported value: "${restart ?? "Always"}": supported values: "OnFailure", "Never"`);
    }
}

const byKind = (objs, kind) => objs.filter((o) => o.kind === kind);
const find = (objs, kind, name) => objs.find((o) => o.kind === kind && o.metadata.name === name) || null;
const podTemplateOf = (o) => (POD_OWNERS[o.kind] ? POD_OWNERS[o.kind](o) : null);

// matchLabels and matchExpressions (In, NotIn, Exists, DoesNotExist); a plain map (Service) too.
// An empty selector matches nothing here (a Service without a selector gets no endpoints).
function selectorMatches(selector, labels = {}) {
    if (!isMap(selector)) return false;
    const plain = !("matchLabels" in selector) && !("matchExpressions" in selector);
    const want = (plain ? selector : selector.matchLabels) || {};
    if (!Object.keys(want).length && !list(selector.matchExpressions).length) return false;
    for (const [k, v] of Object.entries(want)) if (!Object.hasOwn(labels, k) || str(labels[k]) !== str(v)) return false;
    for (const e of list(selector.matchExpressions)) {
        const has = Object.hasOwn(labels, e.key);
        const values = list(e.values).map(str);
        if (e.operator === "In" && !(has && values.includes(str(labels[e.key])))) return false;
        if (e.operator === "NotIn" && has && values.includes(str(labels[e.key]))) return false;
        if (e.operator === "Exists" && !has) return false;
        if (e.operator === "DoesNotExist" && has) return false;
    }
    return true;
}

// ---- Quantities: cpu in millicores, memory in bytes.
function parseCpu(q) {
    const s = str(q).trim();
    const m = s.match(/^(\d+(?:\.\d+)?)(m?)$/);
    if (!m) throw new Error(`quantities must match the regular expression: cpu "${s}"`);
    return m[2] ? Number(m[1]) : Math.round(Number(m[1]) * 1000);
}

const MEMORY_UNITS = { "": 1, k: 1e3, M: 1e6, G: 1e9, T: 1e12, Ki: 1024, Mi: 1024 ** 2, Gi: 1024 ** 3, Ti: 1024 ** 4 };
function parseMemory(q) {
    const s = str(q).trim();
    const m = s.match(/^(\d+(?:\.\d+)?)(Ki|Mi|Gi|Ti|k|M|G|T)?$/);
    if (!m) throw new Error(`quantities must match the regular expression: memory "${s}" (Mi and Gi are the binary units)`);
    return Math.round(Number(m[1]) * MEMORY_UNITS[m[2] || ""]);
}

// ---- Container environment as the kubelet builds it. `cluster` lists objects that already
// exist (created out of band, e.g. `kubectl create secret`); the file's own objects win.
function decodeBase64(s) {
    const clean = str(s).replace(/\s+/g, "");
    if (typeof atob === "function") return decodeURIComponent(escape(atob(clean)));
    return Buffer.from(clean, "base64").toString("utf8");
}

function dataOf(obj) {
    if (!obj) return null;
    const out = {};
    if (obj.kind === "Secret") for (const [k, v] of Object.entries(obj.data || {})) out[k] = decodeBase64(v);
    else for (const [k, v] of Object.entries(obj.data || {})) out[k] = str(v);
    for (const [k, v] of Object.entries(obj.stringData || {})) out[k] = str(v);
    return out;
}

// Returns { env: { NAME: value }, files: { "/path": value }, error: null | "<Reason>: <message>" }.
function containerEnv(container, podSpec, objs, cluster = []) {
    const all = [...objs, ...cluster.filter((c) => !find(objs, c.kind, c.metadata.name))];
    const source = (kind, name) => dataOf(find(all, kind, name));
    const label = (kind) => (kind === "Secret" ? "secret" : "configmap");
    const env = {};
    const files = {};
    try {
        for (const from of list(container.envFrom)) {
            const ref = from.configMapRef || from.secretRef;
            const kind = from.configMapRef ? "ConfigMap" : "Secret";
            const data = source(kind, ref && ref.name);
            if (!data) {
                if (ref && ref.optional) continue;
                throw new Error(`CreateContainerConfigError: ${label(kind)} "${ref && ref.name}" not found`);
            }
            for (const [k, v] of Object.entries(data)) env[`${from.prefix || ""}${k}`] = v;
        }
        for (const e of list(container.env)) {
            if (!isMap(e) || !e.name) throw new Error("env entries need a name");
            if (e.valueFrom) {
                const ref = e.valueFrom.secretKeyRef || e.valueFrom.configMapKeyRef;
                const kind = e.valueFrom.secretKeyRef ? "Secret" : "ConfigMap";
                if (!ref) throw new Error(`env ${e.name}: valueFrom needs secretKeyRef or configMapKeyRef`);
                const data = source(kind, ref.name);
                if (!data) {
                    if (ref.optional) continue;
                    throw new Error(`CreateContainerConfigError: ${label(kind)} "${ref.name}" not found`);
                }
                if (!Object.hasOwn(data, ref.key)) {
                    if (ref.optional) continue;
                    throw new Error(`CreateContainerConfigError: couldn't find key ${ref.key} in ${kind} ${ref.name}`);
                }
                env[e.name] = data[ref.key];
            } else {
                env[e.name] = str(e.value).replace(/\$\(([A-Za-z_][A-Za-z0-9_]*)\)/g, (m, n) => (Object.hasOwn(env, n) ? env[n] : m));
            }
        }
        const volumes = Object.fromEntries(list(podSpec.volumes).map((v) => [v.name, v]));
        for (const m of list(container.volumeMounts)) {
            const v = volumes[m.name];
            if (!v) throw new Error(`volumeMounts: volume "${m.name}" not found in spec.volumes`);
            const ref = v.secret ? { kind: "Secret", name: v.secret.secretName, items: v.secret.items, optional: v.secret.optional }
                : v.configMap ? { kind: "ConfigMap", name: v.configMap.name, items: v.configMap.items, optional: v.configMap.optional } : null;
            if (!ref) continue;
            const data = source(ref.kind, ref.name);
            if (!data) {
                if (ref.optional) continue;
                throw new Error(`ContainerCreating: MountVolume.SetUp failed for volume "${m.name}": ${label(ref.kind)} "${ref.name}" not found`);
            }
            const dir = str(m.mountPath).replace(/\/+$/, "");
            const entries = ref.items ? list(ref.items).map((it) => {
                if (!Object.hasOwn(data, it.key)) throw new Error(`ContainerCreating: MountVolume.SetUp failed for volume "${m.name}": couldn't find key ${it.key}`);
                return [it.path || it.key, data[it.key]];
            }) : Object.entries(data);
            for (const [file, value] of entries) {
                if (m.subPath !== undefined) { if (m.subPath === file) files[dir] = value; } else files[`${dir}/${file}`] = value;
            }
        }
    } catch (e) {
        return { env, files, error: e.message };
    }
    return { env, files, error: null };
}

// ---- Services: each port of a Service and the ready pod addresses it reaches.
// pods: [{ name, labels, ready, ports: [{ name?, containerPort }] }]
function serviceRoutes(svc, pods) {
    const selected = pods.filter((p) => selectorMatches((svc.spec && svc.spec.selector) || {}, p.labels));
    return list(svc.spec && svc.spec.ports).map((sp) => {
        const target = sp.targetPort === undefined || sp.targetPort === null ? sp.port : sp.targetPort;
        const endpoints = [];
        for (const pod of selected.filter((p) => p.ready)) {
            const port = typeof target === "number" ? target : (list(pod.ports).find((p) => p.name === target) || {}).containerPort;
            if (port !== undefined) endpoints.push({ pod: pod.name, port });
        }
        return { name: sp.name || null, port: sp.port, target, endpoints, selected: selected.length };
    });
}

// Pods a Deployment creates (all ready, named <name>-0, <name>-1, ...), for Service checks.
function deploymentPods(dep) {
    const t = dep.spec.template;
    const n = dep.spec.replicas === undefined || dep.spec.replicas === null ? 1 : Number(dep.spec.replicas);
    const ports = list(t.spec.containers).flatMap((c) => list(c.ports));
    return Array.from({ length: n }, (_, i) => ({ name: `${dep.metadata.name}-${i}`, labels: (t.metadata && t.metadata.labels) || {}, ready: true, ports }));
}
// ==== end of the shared core ====================================================================

// ---- Checks of chal_coding_k8s_132: the probes of Rice Rocket's api, on a one-pod timeline.
// input: { checks: [...], scenario?: { seconds, bootSeconds, dbDown?: [from, to], hangAt? } }
// The api answers GET /health once booted (bootSeconds after its container starts) unless the
// process hung; GET /ready also needs Postgres, which is down during [dbDown[0], dbDown[1]).
// At hangAt the running process stops answering; a restarted container does not hang again.
// Probe rules (kubernetes.io "Configure Liveness, Readiness and Startup Probes"):
//   - each probe runs at container start + initialDelaySeconds + k * periodSeconds
//     (defaults: initialDelaySeconds 0, periodSeconds 10, failureThreshold 3, successThreshold 1);
//   - while a startupProbe has not succeeded, liveness and readiness do not run; failureThreshold
//     startup failures in a row restart the container;
//   - failureThreshold liveness failures in a row restart the container;
//   - readiness never restarts: the pod enters the Service endpoints after successThreshold
//     successes and leaves them after failureThreshold failures; without a readinessProbe the pod
//     is ready as soon as its container started (and its startupProbe succeeded);
//   - a restart waits the CrashLoopBackOff delay first: 10 s, 20 s, 40 s ... capped at 300 s.
// httpGet probes must target port http (or 3000) and /health or /ready, else they always fail;
// tcpSocket succeeds once the process listens, even when it hung (the kernel still accepts).
// Output of "timeline": { restarts, firstTraffic, badTrafficSeconds, hangRestartAfter }
//   firstTraffic: first second the pod is in the endpoints (null: never)
//   badTrafficSeconds: seconds the pod was in the endpoints while /ready would have failed
//   hangRestartAfter: seconds from hangAt to the restart that ended the hang (null: not restarted)

function loadApi(source) {
    const objs = loadManifests(source);
    const dep = find(objs, "Deployment", "api");
    if (!dep) throw new Error("the file must keep the Deployment api");
    const container = list(dep.spec.template.spec.containers).find((c) => c.name === "api");
    if (!container) throw new Error("the Deployment must keep the container api");
    for (const kind of ["startupProbe", "readinessProbe", "livenessProbe"]) {
        const p = container[kind];
        if (p === undefined || p === null) continue;
        if (!isMap(p) || !(p.httpGet || p.tcpSocket || p.exec)) throw new Error(`${kind}: needs httpGet, tcpSocket or exec`);
        for (const f of ["initialDelaySeconds", "periodSeconds", "timeoutSeconds", "failureThreshold", "successThreshold"]) {
            if (p[f] !== undefined && !(Number.isInteger(p[f]) && p[f] >= (f === "initialDelaySeconds" ? 0 : 1))) throw new Error(`${kind}.${f}: must be a positive integer`);
        }
        if (kind !== "readinessProbe" && p.successThreshold !== undefined && p.successThreshold !== 1) {
            throw new Error(`${kind}.successThreshold: Invalid value: ${p.successThreshold}: must be 1`);
        }
    }
    return container;
}

function probeSettings(p) {
    return {
        p,
        delay: p.initialDelaySeconds ?? 0,
        period: p.periodSeconds ?? 10,
        failures: p.failureThreshold ?? 3,
        successes: p.successThreshold ?? 1,
    };
}

function simulate(container, sc) {
    const portOk = (port) => port === "http" || port === 3000;
    const db = sc.dbDown || [Infinity, Infinity];
    let start = 0;            // when the current container started (null while backing off)
    let restarts = 0;
    let startupDone = !container.startupProbe;
    let ready = !container.readinessProbe && startupDone;
    const streak = { startupProbe: 0, livenessProbe: 0, readinessFail: 0, readinessOk: 0 };
    let firstTraffic = null;
    let bad = 0;
    let hangRestartAfter = null;
    let nextStart = null;

    const up = (t) => start !== null && t >= start + sc.bootSeconds;
    const hung = (t) => sc.hangAt !== undefined && start !== null && start <= sc.hangAt && t >= sc.hangAt;
    function answers(p, t) {
        if (p.tcpSocket) return portOk(p.tcpSocket.port) && up(t);
        if (p.exec) return up(t) && !hung(t);
        const g = p.httpGet;
        if (!portOk(g.port) || !up(t) || hung(t)) return false;
        if (g.path === "/health") return true;
        if (g.path === "/ready") return !(t >= db[0] && t < db[1]);
        return false;
    }
    const due = (s, t) => t >= start + s.delay && (t - start - s.delay) % s.period === 0;
    function restart(t) {
        restarts++;
        if (hung(t) && hangRestartAfter === null) hangRestartAfter = t - sc.hangAt;
        start = null;
        nextStart = t + Math.min(10 * 2 ** (restarts - 1), 300);
    }

    for (let t = 0; t < sc.seconds; t++) {
        if (start === null && t >= nextStart) {
            start = t;
            startupDone = !container.startupProbe;
            ready = !container.readinessProbe && startupDone;
            Object.keys(streak).forEach((k) => { streak[k] = 0; });
        }
        if (start !== null) {
            if (!startupDone) {
                const s = probeSettings(container.startupProbe);
                if (due(s, t)) {
                    if (answers(s.p, t)) {
                        startupDone = true;
                        if (!container.readinessProbe) ready = true;
                    } else if (++streak.startupProbe >= s.failures) {
                        restart(t);
                    }
                }
            }
            if (start !== null && startupDone && container.livenessProbe) {
                const s = probeSettings(container.livenessProbe);
                if (due(s, t)) {
                    if (answers(s.p, t)) streak.livenessProbe = 0;
                    else if (++streak.livenessProbe >= s.failures) restart(t);
                }
            }
            if (start !== null && startupDone && container.readinessProbe) {
                const s = probeSettings(container.readinessProbe);
                if (due(s, t)) {
                    if (answers(s.p, t)) {
                        streak.readinessFail = 0;
                        if (++streak.readinessOk >= s.successes) ready = true;
                    } else {
                        streak.readinessOk = 0;
                        if (++streak.readinessFail >= s.failures) ready = false;
                    }
                }
            }
        }
        const inEndpoints = start !== null && ready;
        if (!inEndpoints) continue;
        if (firstTraffic === null) firstTraffic = t;
        const wouldServe = up(t) && !hung(t) && !(t >= db[0] && t < db[1]);
        if (!wouldServe) bad++;
    }
    return { restarts, firstTraffic, badTrafficSeconds: bad, hangRestartAfter };
}

async function __harness(input) {
    let container = null;
    let error = null;
    try {
        container = loadApi(__source);
    } catch (e) {
        error = e.message;
    }
    const out = {};
    for (const check of input.checks) {
        if (check === "parse") { out.parse = error ? `error: ${error}` : "ok"; continue; }
        if (error) { out[check] = false; continue; }
        if (check === "timeline") out.timeline = simulate(container, input.scenario);
        else if (check === "probes") out.probes = ["startupProbe", "readinessProbe", "livenessProbe"].filter((k) => container[k]);
        else out[check] = `unknown check ${check}`;
    }
    return out;
}
