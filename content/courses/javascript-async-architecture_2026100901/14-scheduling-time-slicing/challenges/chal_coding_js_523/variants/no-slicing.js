// Wrong variant: priorities are right, but a turn runs until the queue is empty -
// one long task that blocks input for the whole job.
function createScheduler(options, host) {
  const order = ["user-blocking", "user-visible", "background"];
  const queues = { "user-blocking": [], "user-visible": [], background: [] };
  let requested = false;
  const pick = () => order.map((p) => queues[p]).find((q) => q.length > 0) || null;
  function run() {
    requested = false;
    let q;
    while ((q = pick())) {
      const next = q[0]();
      if (typeof next === "function") q[0] = next; else q.shift();
    }
  }
  return { schedule(task, priority = "user-visible") { queues[queues[priority] ? priority : "user-visible"].push(task); if (!requested) { requested = true; host.yieldToHost(run); } } };
}
