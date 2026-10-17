// Wrong variant: the "turn requested" flag is only cleared when a turn yields early, so once
// the queue drains the scheduler never asks the host for a turn again.
function createScheduler(options, host) {
  const order = ["user-blocking", "user-visible", "background"];
  const queues = { "user-blocking": [], "user-visible": [], background: [] };
  let requested = false;
  const pick = () => order.map((p) => queues[p]).find((q) => q.length > 0) || null;
  function request() { if (!requested) { requested = true; host.yieldToHost(run); } }
  function run() {
    const start = host.now();
    let q;
    while ((q = pick())) {
      const next = q[0]();
      if (typeof next === "function") q[0] = next; else q.shift();
      if (host.now() - start >= options.sliceMs && pick()) { requested = false; request(); return; }
    }
  }
  return { schedule(task, priority = "user-visible") { queues[queues[priority] ? priority : "user-visible"].push(task); request(); } };
}
