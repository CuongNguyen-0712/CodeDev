// Wrong variant: a continuation goes to the BACK of its priority queue (round-robin),
// so two same-priority tasks interleave instead of finishing in order.
function createScheduler(options, host) {
  const order = ["user-blocking", "user-visible", "background"];
  const queues = { "user-blocking": [], "user-visible": [], background: [] };
  let requested = false;
  const pick = () => order.map((p) => queues[p]).find((q) => q.length > 0) || null;
  function request() { if (!requested) { requested = true; host.yieldToHost(run); } }
  function run() {
    requested = false;
    const start = host.now();
    let q;
    while ((q = pick())) {
      const fn = q.shift();
      const next = fn();
      if (typeof next === "function") q.push(next);
      if (host.now() - start >= options.sliceMs) { if (pick()) request(); return; }
    }
  }
  return { schedule(task, priority = "user-visible") { queues[queues[priority] ? priority : "user-visible"].push(task); request(); } };
}
