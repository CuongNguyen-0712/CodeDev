// Pure helpers for the load-run samplers (no I/O, unit tested).

// Busy percent (0-100) across all cores between two os.cpus() snapshots.
export function cpuPercent(prev, cur) {
    let busy = 0;
    let total = 0;
    cur.forEach((c, i) => {
        const p = prev[i].times;
        const d = (k) => c.times[k] - p[k];
        const idle = d("idle");
        const all = d("user") + d("nice") + d("sys") + d("irq") + idle;
        busy += all - idle;
        total += all;
    });
    return total > 0 ? (busy / total) * 100 : 0;
}

const UNIT_MB = { b: 1 / 1048576, kib: 1 / 1024, kb: 1 / 1000, mib: 1, mb: 1, gib: 1024, gb: 1000, tib: 1048576 };

// One line of `docker stats --no-stream --format "{{json .}}"`.
export function parseDockerStats(line) {
    const j = JSON.parse(line);
    const [, num, unit] = /^([\d.]+)\s*([a-zA-Z]+)/.exec(j.MemUsage.split("/")[0].trim());
    return { name: j.Name, cpu: parseFloat(j.CPUPerc), memMb: parseFloat(num) * UNIT_MB[unit.toLowerCase()] };
}

// Peak VUs a profile reaches: the sessions to mint (loadtest/k6/main.js refuses more VUs than sessions).
export function peakSessions(profile, { n, maxVus }) {
    if (profile === "smoke") return 5;
    if (profile === "stress") return maxVus;
    if (profile === "soak") return Math.ceil(0.7 * n);
    if (profile === "spike") return 2 * n;
    throw new Error(`unknown profile ${profile}: use smoke, stress, soak or spike`);
}

// "server" when the env file points the app at an Inngest server (dev server or cloud keys), else functions run inline.
export function inngestMode(env) {
    return env.INNGEST_DEV || env.INNGEST_EVENT_KEY ? "server" : "inline";
}

// Soak and spike are relative to the N that stress measured: refuse to guess it.
export function needsN(profile, n) {
    return (profile === "soak" || profile === "spike") && !(Number(n) > 0);
}
