// scripts/check-budgets.js: the CI step after `lhci collect` (3 runs per page). It fails the pull
// request when a page breaks its budget or when a metric grew too much since main.
//
// report, baseline: { "<path>": { runs: [{ lcp, tbt, cls, scriptKB, imageKB }, ...] } }
//                   (baseline = the last report on main; a new page has no baseline)
// config: { assertions: [{ match, metric, max, level: "error" | "warn" }], regression: { <metric>: 0.05 } }
// return: { status: "pass" | "warn" | "fail", lines: [errors first, then warnings, each sorted] }
function checkBudgets(report, baseline, config) {
    const lines = [];
    for (const [url, { runs }] of Object.entries(report)) {
        // @piece assert-budgets: Check every budget that names this page
        for (const a of config.assertions) {
            if (!matchesPath(a.match, url)) continue;
            const value = median(runs.map((r) => r[a.metric]));
            if (value > a.max) lines.push({ level: a.level, text: `${a.level} ${url} ${a.metric} ${fmt(value)} > ${a.max}` });
        }
        // @end
        // @piece regression-vs-main: Fail when a metric grew too much since main
        const base = baseline[url];
        if (base) {
            for (const [metric, limit] of Object.entries(config.regression || {})) {
                const before = median(base.runs.map((r) => r[metric]));
                const now = median(runs.map((r) => r[metric]));
                const growth = (now - before) / before;
                if (growth > limit) lines.push({ level: "error", text: `error ${url} ${metric} +${fmt(growth * 100)}% vs main (${fmt(before)} -> ${fmt(now)})` });
            }
        }
        // @end
    }
    // @piece final-status: Fail on any error, warn when there are only warnings
    const status = lines.some((l) => l.level === "error") ? "fail" : lines.length ? "warn" : "pass";
    // @end
    const rank = { error: 0, warn: 1 };
    lines.sort((a, b) => rank[a.level] - rank[b.level] || (a.text < b.text ? -1 : a.text > b.text ? 1 : 0));
    return { status, lines: lines.map((l) => l.text) };
}

// @piece median-of-runs: The middle value of the runs, robust to one noisy run
function median(values) {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
// @end

// @piece matches-path: A budget's page pattern, * is one path segment
function matchesPath(pattern, url) {
    const parts = pattern.split("*").map((p) => p.replace(/[.+?^${}()|[\]\\]/g, "\\$&"));
    return new RegExp(`^${parts.join("[^/]+")}$`).test(url);
}
// @end

function fmt(n) {
    return String(Math.round(n * 100) / 100);
}
