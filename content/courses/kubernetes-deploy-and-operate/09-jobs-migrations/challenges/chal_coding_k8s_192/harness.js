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

// ---- Checks of chal_coding_k8s_192: the migration Job and the nightly CronJob of Rice Rocket.
// Job: pods run one after another; a failed pod is retried after the documented back-off
// (10 s, 20 s, 40 s ... capped at 6 min) until more than backoffLimit (default 6) have failed
// (BackoffLimitExceeded), or activeDeadlineSeconds after the start (DeadlineExceeded).
// restartPolicy Never makes a new pod per attempt; OnFailure restarts the container in one pod.
// CronJob: schedules are read in spec.timeZone, or in the controller's zone (UTC on the managed
// cluster) when it is unset; concurrencyPolicy Allow | Forbid | Replace; after the controller was
// down it starts the latest missed run, unless that run is later than startingDeadlineSeconds;
// each run is stopped at the jobTemplate's activeDeadlineSeconds.
// input: { checks: [...], attempts?: [{ result: "ok" | "fail", seconds }],
//          window?: { from: "MM-DD HH:MM" (Ho Chi Minh City time, 2026), hours }, durations?: [seconds per run],
//          controllerDown?: [["MM-DD HH:MM", "MM-DD HH:MM"]] }
// Times in the output are Ho Chi Minh City time (UTC+7, no daylight saving).
// shortcut: time zones limited to Asia/Ho_Chi_Minh and UTC; add offsets here if a lesson needs more.
const ZONES = { "Asia/Ho_Chi_Minh": 7 * 3600, "UTC": 0, "Etc/UTC": 0 };
const HCMC = ZONES["Asia/Ho_Chi_Minh"];

function runJob(job, attempts) {
    const spec = job.spec;
    const limit = spec.backoffLimit ?? 6;
    const deadline = spec.activeDeadlineSeconds ?? null;
    const perAttemptPod = spec.template.spec.restartPolicy === "Never";
    let t = 0, failures = 0, pods = 0;
    const finish = (condition, reason, at) => ({
        pods, condition, reason, finishedAfter: at,
        deletedAfter: spec.ttlSecondsAfterFinished === undefined || spec.ttlSecondsAfterFinished === null ? null : at + spec.ttlSecondsAfterFinished,
    });
    for (let i = 0; ; i++) {
        const a = attempts[Math.min(i, attempts.length - 1)];
        pods = perAttemptPod ? pods + 1 : 1;
        const end = t + a.seconds;
        if (deadline !== null && end > deadline) return finish("Failed", "DeadlineExceeded", deadline);
        if (a.result === "ok") return finish("Complete", null, end);
        failures++;
        if (failures > limit) return finish("Failed", "BackoffLimitExceeded", end);
        t = end + Math.min(10 * 2 ** (failures - 1), 360);
        if (deadline !== null && t >= deadline) return finish("Failed", "DeadlineExceeded", deadline);
    }
}

// ---- Cron: minute hour day-of-month month day-of-week; *, */n, a-b, a-b/n, lists, @daily etc.
const MACROS = { "@yearly": "0 0 1 1 *", "@annually": "0 0 1 1 *", "@monthly": "0 0 1 * *", "@weekly": "0 0 * * 0", "@daily": "0 0 * * *", "@midnight": "0 0 * * *", "@hourly": "0 * * * *" };
function cronField(text, min, max) {
    const set = new Set();
    for (const part of str(text).split(",")) {
        const m = part.match(/^(\*|\d+(?:-\d+)?)(?:\/(\d+))?$/);
        if (!m) throw new Error(`spec.schedule: Invalid value: "${text}"`);
        let [lo, hi] = m[1] === "*" ? [min, max] : m[1].split("-").map(Number);
        if (hi === undefined) hi = m[2] ? max : lo;
        if (lo < min || hi > max || lo > hi) throw new Error(`spec.schedule: Invalid value: "${text}" (out of range)`);
        for (let v = lo; v <= hi; v += Number(m[2] || 1)) set.add(v);
    }
    return { set, any: str(text) === "*" };
}
function parseCron(schedule) {
    const s = str(schedule).trim();
    if (/^(CRON_)?TZ=/.test(s)) throw new Error("spec.schedule: Invalid value: CRON_TZ or TZ is not supported, use the spec.timeZone field");
    const fields = (MACROS[s] || s).split(/\s+/);
    if (fields.length !== 5) throw new Error(`spec.schedule: Invalid value: "${s}" (expected 5 fields)`);
    const [mi, h, dom, mon, dow] = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 7]].map(([lo, hi], i) => cronField(fields[i], lo, hi));
    if (dow.set.has(7)) dow.set.add(0);
    return (d) => {
        if (!mi.set.has(d.getUTCMinutes()) || !h.set.has(d.getUTCHours()) || !mon.set.has(d.getUTCMonth() + 1)) return false;
        const domOk = dom.set.has(d.getUTCDate()), dowOk = dow.set.has(d.getUTCDay());
        // Standard cron: when both day fields are restricted, either one matching is enough.
        return dom.any || dow.any ? domOk && dowOk : domOk || dowOk;
    };
}

// "MM-DD HH:MM" in Ho Chi Minh City time <-> seconds since the epoch (UTC).
const fromLocal = (text) => {
    const m = str(text).match(/^(\d\d)-(\d\d) (\d\d):(\d\d)$/);
    if (!m) throw new Error(`bad time "${text}"`);
    return Date.UTC(2026, Number(m[1]) - 1, Number(m[2]), Number(m[3]), Number(m[4])) / 1000 - HCMC;
};
const toLocal = (sec) => new Date((sec + HCMC) * 1000).toISOString().replace(/^\d{4}-(\d\d-\d\d)T(\d\d:\d\d).*$/, "$1 $2");

function runCron(cron, input) {
    const spec = cron.spec;
    const zone = spec.timeZone === undefined || spec.timeZone === null ? "UTC" : str(spec.timeZone);
    if (!Object.hasOwn(ZONES, zone)) throw new Error(`spec.timeZone: Invalid value: "${zone}": unknown time zone`);
    const matches = parseCron(spec.schedule);
    const policy = spec.concurrencyPolicy || "Allow";
    if (!["Allow", "Forbid", "Replace"].includes(policy)) throw new Error(`spec.concurrencyPolicy: Unsupported value: "${policy}"`);
    const startingDeadline = spec.startingDeadlineSeconds ?? null;
    const runDeadline = (spec.jobTemplate.spec && spec.jobTemplate.spec.activeDeadlineSeconds) ?? null;
    const from = fromLocal(input.window.from);
    const to = from + input.window.hours * 3600;
    const down = list(input.controllerDown).map(([a, b]) => [fromLocal(a), fromLocal(b)]);
    const scheduled = [];
    for (let t = from; t < to; t += 60) if (matches(new Date((t + ZONES[zone]) * 1000))) scheduled.push(t);

    const runs = [];
    const active = [];
    scheduled.forEach((s, i) => {
        let start = s;
        const outage = down.find(([a, b]) => s >= a && s < b);
        if (outage) {
            const later = scheduled.find((x) => x > s && x < outage[1]);
            if (later !== undefined) { runs.push({ scheduled: toLocal(s), result: "skipped: a later run was also missed" }); return; }
            start = outage[1];
            if (startingDeadline !== null && start - s > startingDeadline) {
                runs.push({ scheduled: toLocal(s), result: "skipped: missed the starting deadline" });
                return;
            }
        }
        const running = active.filter((r) => r.start <= start && r.end > start);
        if (running.length && policy === "Forbid") { runs.push({ scheduled: toLocal(s), result: "skipped: the previous run is still active" }); return; }
        if (policy === "Replace") for (const r of running) { r.end = start; r.out.ended = toLocal(start); r.out.result = "replaced by the next run"; }
        const duration = (input.durations || [])[i] ?? 600;
        const cut = runDeadline !== null && duration > runDeadline;
        const end = start + (cut ? runDeadline : duration);
        const out = { scheduled: toLocal(s), started: toLocal(start), ended: toLocal(end), result: cut ? "DeadlineExceeded" : "Complete" };
        if (running.length) out.overlapsWith = running.map((r) => r.out.scheduled);
        runs.push(out);
        active.push({ start, end, out });
    });
    return runs;
}

async function __harness(input) {
    let objs = null;
    let error = null;
    try {
        objs = loadManifests(__source);
        if (byKind(objs, "Job").length !== 1 || byKind(objs, "CronJob").length !== 1) throw new Error("the file must define one Job and one CronJob");
        parseCron(byKind(objs, "CronJob")[0].spec.schedule);
    } catch (e) {
        error = e.message;
    }
    const out = {};
    for (const check of input.checks) {
        if (check === "parse") { out.parse = error ? `error: ${error}` : "ok"; continue; }
        if (error) { out[check] = false; continue; }
        try {
            if (check === "job") out.job = runJob(byKind(objs, "Job")[0], input.attempts);
            else if (check === "cron") out.cron = runCron(byKind(objs, "CronJob")[0], input);
            else out[check] = `unknown check ${check}`;
        } catch (e) {
            out[check] = `error: ${e.message}`;
        }
    }
    return out;
}
