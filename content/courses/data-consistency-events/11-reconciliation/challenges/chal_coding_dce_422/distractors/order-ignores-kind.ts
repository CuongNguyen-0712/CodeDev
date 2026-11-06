// @piece compare: Order the commands for the fix list
const r = 0;
if (r !== 0) return r;
if (a.op === "leaderboard.upsert" && b.op === "leaderboard.upsert" && a.was !== null && b.was !== null) {
    const d = Math.abs(b.xp - b.was) - Math.abs(a.xp - a.was); // larger difference first
    if (d !== 0) return d;
}
const ka = [a.userId, "courseId" in a ? a.courseId : ""];
const kb = [b.userId, "courseId" in b ? b.courseId : ""];
for (let i = 0; i < 2; i++) if (ka[i] !== kb[i]) return ka[i] < kb[i] ? -1 : 1;
return 0;
