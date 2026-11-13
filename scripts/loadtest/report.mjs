// Usage: node scripts/loadtest/report.mjs <runDir>  -> docs/loadtest/<yyyy-mm-dd>-<env>-<profile>[-2..].md (never overwrites)
//
// Per-request outcome: server actions answer HTTP 200 even on failure, so the status tag of
// http_req_duration is not used. The client (loadtest/k6/lib/client.js) records exactly one
// `failed_requests` Rate point per logical request (value 1 = error) and one `limited` Counter
// point per 429, all with the endpoint/class/stage tags. Latency comes from http_req_duration
// points (one per HTTP exchange, so a refresh-and-retry adds a second latency sample but one outcome).
// A request answered 429 also has a failed_requests value-0 point; that one is reclassified as "limited".
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import { STAGE_MS, THRESHOLDS } from "../../loadtest/k6/lib/pure.js";
import { bottlenecks, computeN, finishFold, foldLine, newFold, percentile, runValidity, stageAtVus, RAMP_MS } from "./reportPure.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const WATCHED = ['"metric":"http_req_duration"', '"metric":"failed_requests"', '"metric":"limited"'];

const readJson = (f, fallback) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : fallback);
const fmt = (x, d = 0) => (Number.isFinite(x) ? x.toFixed(d) : "n/a");
const cell = (s) => String(s).replace(/\s+/g, " ").replace(/\|/g, "\\|").replace(/`/g, "'");

async function readK6(file, opts) {
    const st = newFold();
    const rl = readline.createInterface({ input: fs.createReadStream(file).pipe(zlib.createGunzip()), crlfDelay: Infinity });
    for await (const line of rl) {
        if (WATCHED.some((w) => line.includes(w))) foldLine(st, line, opts);
    }
    return finishFold(st);
}

function table(head, rows) {
    return [`| ${head.join(" | ")} |`, `|${head.map(() => "---").join("|")}|`, ...rows.map((r) => `| ${r.join(" | ")} |`)].join("\n");
}

const endpointRows = (stage) =>
    [...stage.byEndpoint].map(([key, ms]) => {
        const i = key.indexOf(" ");
        return { cls: key.slice(0, i), ep: key.slice(i + 1), ms };
    }).sort((a, b) => percentile(b.ms, 95) - percentile(a.ms, 95)).map((r) =>
        [cell(r.ep), r.cls, r.ms.length, fmt(percentile(r.ms, 50)), fmt(percentile(r.ms, 95)), fmt(percentile(r.ms, 99))]);

export async function buildReport(runDir) {
    const meta = readJson(path.join(runDir, "meta.json"));
    if (!meta) throw new Error(`no meta.json in ${runDir}`);
    const stress = meta.profile === "stress";
    const { stages, journeys } = await readK6(path.join(runDir, "k6.json.gz"), { hold: stress, maxVus: meta.maxVus });
    const samplesFile = path.join(runDir, "samples.ndjson");
    const samples = fs.existsSync(samplesFile) ? fs.readFileSync(samplesFile, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
    const statements = readJson(path.join(runDir, "statements.json"), []);
    const host = samples.filter((s) => s.kind === "host");
    const docker = samples.filter((s) => s.kind === "docker");
    const db = samples.filter((s) => s.kind === "db");
    const peak = (list, f) => (list.length ? Math.max(...list.map(f)) : NaN);
    const dockerPeak = (re, f) => peak(docker.filter((s) => re.test(s.name)), f);

    const out = [];
    out.push(`# Load test report: ${meta.env} / ${meta.profile}`, "", `Run \`${path.basename(runDir)}\`, commit \`${meta.commit}\`, ${meta.startedAt} to ${meta.endedAt}.`, "");

    const validity = runValidity(host);
    let atN = null;
    if (stress) {
        const r = computeN(stages, THRESHOLDS);
        out.push("## Capacity (N)", "");
        out.push(r.n === null ? "**N = none**: the first stage already broke a threshold." : `**N = ${r.n} concurrent VUs.**`);
        out.push(r.breakStage === null
            ? "No threshold broke before the run ended (the real limit is above the last stage; raise --max-vus)."
            : `First break at stage ${r.breakStage} (${stages.get(r.breakStage).vus} VUs): ${r.reason}.`);
        out.push("", `Thresholds: read p95 < ${THRESHOLDS.readP95} ms, write p95 < ${THRESHOLDS.writeP95} ms, error rate < ${THRESHOLDS.errorRate * 100}% (HTTP 429 is not an error). A stage passes only strictly below each limit; N is the highest stage where every stage up to it passes. Requests after the scheduled end (VUs finishing their last iteration) are dropped.`,
            `Only the hold window is measured: points in the first ${RAMP_MS / 1000} s of each ${STAGE_MS / 1000} s stage (the ramp) are ignored, so N is read at a steady VU level. Stage start = first tagged k6 point + stage x ${STAGE_MS / 1000} s.`, "");
        out.push(table(["stage", "VUs", "reads", "read p95 ms", "writes", "write p95 ms", "requests", "error %", "429"],
            [...stages.keys()].sort((a, b) => a - b).map((k) => {
                const s = stages.get(k);
                return [k, s.vus, s.read.length, fmt(percentile(s.read, 95)), s.write.length, fmt(percentile(s.write, 95)), s.total, fmt(s.total ? (100 * s.errors) / s.total : 0, 2), s.limited];
            })), "");
        const bn = (st, label) => {
            const list = bottlenecks(st, THRESHOLDS);
            out.push(`Bottleneck endpoints at ${label} (p95 over ${THRESHOLDS.bottleneckFactor}x the class threshold): ${list.length ? list.map((b) => `${cell(b.endpoint)} (${b.cls}, ${fmt(b.p95)} ms)`).join(", ") : "none"}.`, "");
        };
        const nStage = stages.get(stageAtVus(stages, r.n));
        if (nStage) bn(nStage, `N (${r.n} VUs)`);
        if (r.breakStage !== null) bn(stages.get(r.breakStage), `the break stage (${stages.get(r.breakStage).vus} VUs)`);
        atN = nStage ?? (r.breakStage !== null ? stages.get(r.breakStage) : [...stages.values()].pop());
        out.push(`Endpoint table below is for ${nStage ? `N (${r.n} VUs)` : "the break stage (no N)"}.`, "");
    } else {
        out.push(`Profile \`${meta.profile}\` does not compute N; all points of the run are pooled below (ramps included).`, "");
        atN = stages.get(0);
    }

    out.push("## Run validity", "", `${validity.valid ? "Valid" : "**INVALID**"}: worst 1-minute mean host CPU of the load machine ${validity.worstMinuteCpu}% (limit 80%).${validity.valid ? "" : " The load generator was saturated, so latencies may reflect it, not the app."}`,
        `k6 container peak CPU: ${fmt(dockerPeak(/^k6-/, (s) => s.cpu), 1)}% (informational; docker percent, 100 = one core).`, `k6 exit code: ${meta.k6ExitCode}.`, "");

    out.push("## Latency by endpoint", "");
    const rows = atN ? endpointRows(atN) : [];
    out.push(rows.length ? table(["endpoint", "class", "n", "p50 ms", "p95 ms", "p99 ms"], rows) : "No measured requests.", "");

    const limitedBy = new Map();
    for (const s of stages.values()) for (const [k, v] of s.limitedBy) limitedBy.set(k, (limitedBy.get(k) ?? 0) + v);
    out.push("## HTTP 429 by endpoint (measured window)", "");
    out.push(limitedBy.size
        ? table(["endpoint", "class", "429"], [...limitedBy].sort((a, b) => b[1] - a[1]).map(([k, v]) => [cell(k.slice(k.indexOf(" ") + 1)), k.slice(0, k.indexOf(" ")), v]))
        : "None.", "");

    out.push("## Top 10 queries (pg_stat_statements, by total time)", "");
    out.push(statements.length
        ? table(["query", "calls", "mean ms", "total ms", "rows"], statements.slice(0, 10).map((q) => [`\`${cell(q.query).slice(0, 200)}\``, q.calls, fmt(q.mean_exec_time, 2), fmt(q.total_exec_time), q.rows]))
        : "No statements captured.", "");

    const conn = peak(db, (s) => (s.connections?.active ?? 0) + (s.connections?.idle ?? 0));
    const codeRuns = peak(db, (s) => Object.values(s.codeRuns ?? {}).reduce((a, b) => a + b, 0));
    out.push("## Resources (peaks over the whole run)", "", table(["metric", "peak"], [
        ["app CPU %", fmt(dockerPeak(/app/, (s) => s.cpu), 1)], ["app memory MB", fmt(dockerPeak(/app/, (s) => s.memMb))],
        ["database CPU %", fmt(dockerPeak(/postgres/, (s) => s.cpu), 1)], ["database memory MB", fmt(dockerPeak(/postgres/, (s) => s.memMb))],
        ["database connections (active + idle)", fmt(conn)], ["locks waiting", fmt(peak(db, (s) => s.locksWaiting ?? 0))],
        ["outbox pending (largest queue)", fmt(peak(db, (s) => s.outboxPending ?? 0))], ["code runs queued (all states)", fmt(codeRuns)],
        ["dead letters open", fmt(peak(db, (s) => s.deadLettersOpen ?? 0))],
    ]), "");

    const jt = Object.values(journeys).reduce((a, b) => a + b, 0);
    out.push("## Assumptions", "",
        `- Environment \`${meta.env}\`, profile \`${meta.profile}\`, Inngest \`${meta.inngest}\`, Prometheus remote-write ${meta.prometheus ? "on" : "off"}, max VUs ${meta.maxVus}${meta.n != null ? `, N input ${meta.n}` : ""}.`,
        `- Seed: ${meta.users} users, ${meta.sessions} pre-minted sessions (one per VU).`,
        `- Journey mix by request count: ${jt ? Object.entries(journeys).map(([j, c]) => `${j} ${fmt((100 * c) / jt, 1)}%`).join(", ") : "n/a"}.`,
        "- Outcome per request comes from the client's `failed_requests` / `limited` metrics, not the HTTP status (server actions return 200 on failure).", "");
    return { text: out.join("\n"), meta };
}

export async function writeReport(runDir) {
    const { text, meta } = await buildReport(runDir);
    const d = new Date(meta.startedAt);
    const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const dir = path.join(root, "docs/loadtest");
    fs.mkdirSync(dir, { recursive: true });
    let file = path.join(dir, `${day}-${meta.env}-${meta.profile}.md`);
    for (let i = 2; fs.existsSync(file); i++) file = path.join(dir, `${day}-${meta.env}-${meta.profile}-${i}.md`);
    fs.writeFileSync(file, text);
    return file;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    if (!process.argv[2]) {
        console.error("usage: report.mjs <runDir>");
        process.exit(1);
    }
    writeReport(path.resolve(process.argv[2])).then((f) => console.log(`report: ${f}`), (e) => {
        console.error(`report failed: ${e.message}`);
        process.exit(1);
    });
}
