// rum/summarize.js: Rice Rocket's RUM endpoint stores every beacon the web-vitals library sends
// from real visits (onLCP / onINP / onCLS with the attribution build). The nightly job turns them
// into one line per page and metric, the way the Core Web Vitals assessment reads them.
//
// beacon:  { page, name: "LCP" | "INP" | "CLS", id, value, target }
//          id identifies one metric instance of one visit; web-vitals reports INP and CLS again
//          each time they grow, so the same id can arrive several times (the last one counts).
//          target is the attribution selector (LCP element, INP interaction target, CLS shift source).
// return:  { "<page> <name>": { p75, rating: "good" | "needs-improvement" | "poor", samples, culprit } }
const THRESHOLDS = { LCP: [2500, 4000], INP: [200, 500], CLS: [0.1, 0.25] };

function summarize(beacons) {
    // @piece latest-per-id: Keep only the latest report of each metric instance
    const latest = new Map();
    for (const beacon of beacons) latest.set(beacon.id, beacon);
    // @end
    const groups = new Map();
    for (const beacon of latest.values()) {
        const key = `${beacon.page} ${beacon.name}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(beacon);
    }
    const out = {};
    for (const key of [...groups.keys()].sort()) {
        const samples = groups.get(key);
        const name = samples[0].name;
        // @piece p75: The 75th percentile value (nearest rank)
        const values = samples.map((s) => s.value).sort((a, b) => a - b);
        const p75 = values[Math.ceil(values.length * 0.75) - 1];
        // @end
        // @piece rate: Good, needs improvement or poor by the metric's thresholds
        const [good, poor] = THRESHOLDS[name];
        const rating = p75 <= good ? "good" : p75 <= poor ? "needs-improvement" : "poor";
        // @end
        // @piece culprit: The target behind most samples at or above p75
        const counts = new Map();
        for (const s of samples) if (s.value >= p75) counts.set(s.target, (counts.get(s.target) || 0) + 1);
        const culprit = [...counts].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0][0];
        // @end
        out[key] = { p75, rating, samples: samples.length, culprit };
    }
    return out;
}
