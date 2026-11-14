// Sampler for a load run: appends {t, kind, ...} lines to <dir>/samples.ndjson.
//   host   every 5 s  Windows host CPU (os.cpus)
//   docker every 5 s  `docker stats` of the given containers
//   db     every 15 s connections by state, waiting locks, pending outbox, code_runs by status, open dead letters
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { cpuPercent, parseDockerStats } from "./samplePure.mjs";

const run = promisify(execFile);

// One row of JSON; the tables are the ones sessionDb.claimOutbox, challenge runs and deadLetterDb read.
export const DB_SAMPLE_SQL = `SELECT json_build_object(
  'connections', (SELECT COALESCE(json_object_agg(COALESCE(state, 'none'), n), '{}'::json) FROM (SELECT state, count(*)::int n FROM pg_stat_activity WHERE datname = current_database() GROUP BY state) s),
  'locksWaiting', (SELECT count(*)::int FROM pg_locks WHERE NOT granted),
  'outboxPending', (SELECT count(*)::int FROM identity.auth_outbox WHERE processed_at IS NULL AND dead_at IS NULL),
  'codeRuns', (SELECT COALESCE(json_object_agg(status, n), '{}'::json) FROM (SELECT status, count(*)::int n FROM challenge.code_runs GROUP BY status) r),
  'deadLettersOpen', (SELECT count(*)::int FROM ops.dead_letters WHERE resolved_at IS NULL)
);`;

// opts: { dir, containers: string[], dbQuery: (sql) => Promise<string> }. Returns async stop().
export function startSampler({ dir, containers, dbQuery }) {
    const out = fs.createWriteStream(path.join(dir, "samples.ndjson"), { flags: "a" });
    const write = (kind, data) => out.write(JSON.stringify({ t: Date.now(), kind, ...data }) + "\n");
    let prev = os.cpus();
    const inflight = new Set();
    const every = (ms, fn) => {
        const tick = () => {
            const p = fn().catch((e) => write("error", { source: fn.name, message: String(e.message).slice(0, 200) }));
            inflight.add(p);
            p.finally(() => inflight.delete(p));
        };
        tick();
        return setInterval(tick, ms);
    };

    const timers = [
        every(5000, async function host() {
            const cur = os.cpus();
            write("host", { cpu: cpuPercent(prev, cur), cores: cur.length });
            prev = cur;
        }),
        every(5000, async function docker() {
            // The k6 container may not exist yet or any more: sample only the running ones.
            const up = (await run("docker", ["ps", "--format", "{{.Names}}"])).stdout.split(/\s+/);
            const live = containers.filter((c) => up.includes(c));
            if (!live.length) return;
            const { stdout } = await run("docker", ["stats", "--no-stream", "--format", "{{json .}}", ...live]);
            for (const line of stdout.split("\n").filter(Boolean)) write("docker", parseDockerStats(line));
        }),
        every(15000, async function db() {
            write("db", JSON.parse((await dbQuery(DB_SAMPLE_SQL)).trim()));
        }),
    ];

    return async function stop() {
        timers.forEach(clearInterval);
        await Promise.allSettled([...inflight]);
        await new Promise((r) => out.end(r));
    };
}
