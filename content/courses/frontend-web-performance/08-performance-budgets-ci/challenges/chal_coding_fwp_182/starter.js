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
        // [ ] Check every budget that names this page
        // [ ] Fail when a metric grew too much since main
    }
    // [ ] Fail on any error, warn when there are only warnings
    const rank = { error: 0, warn: 1 };
    lines.sort((a, b) => rank[a.level] - rank[b.level] || (a.text < b.text ? -1 : a.text > b.text ? 1 : 0));
    return { status, lines: lines.map((l) => l.text) };
}

// [ ] The middle value of the runs, robust to one noisy run

// [ ] A budget's page pattern, * is one path segment

function fmt(n) {
    return String(Math.round(n * 100) / 100);
}
