// @piece self-time: The part of the span no child covers
const parts = children
    .map((c) => [c.startTime, c.endTime] as const)
    .filter(([s, e]) => e > s)
    .sort((a, b) => a[0] - b[0]);
let covered = 0;
let reach = span.startTime;
for (const [s, e] of parts) {
    if (e <= reach) continue;
    covered += e - Math.max(s, reach);
    reach = e;
}
return span.endTime - span.startTime - covered;
