// @piece tick: Advance the clock and fire what is due
const end = current + Math.max(0, Number(ms) || 0);
const due = [...timers.values()].filter((t) => t.at <= end).sort((a, b) => a.at - b.at || a.id - b.id);
for (const timer of due) fire(timer);
current = end;
