// @piece request-reads: Rule 3: pages that read request-time APIs
const reads = page.reads;
if (reads.length > 0) return { route, strategy: "dynamic", reason: `reads ${reads.join(", ")}` };
