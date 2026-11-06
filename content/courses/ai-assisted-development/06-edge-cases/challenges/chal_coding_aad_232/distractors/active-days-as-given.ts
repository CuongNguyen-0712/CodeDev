// @piece active-days: The learner's active days, once each, in order
const days = new Set<number>(); // several completions on one day count once
for (const ts of completedAt) {
    const ms = Date.parse(ts);
    if (!Number.isNaN(ms)) days.add(localDay(ms, offsetMinutes));
}
const sorted = [...days];
