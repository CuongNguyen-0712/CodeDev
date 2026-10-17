// Wrong variant: picks a task by priority, then keeps running ITS continuations until it is
// done or the slice ends - urgent work scheduled mid-turn waits behind a background job.
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
      let fn = q.shift();
      while (typeof fn === "function") {
        fn = fn();
        if (host.now() - start >= options.sliceMs) {
          if (typeof fn === "function") q.unshift(fn);
          if (pick()) request();
          return;
        }
      }
    }
  }
  return { schedule(task, priority = "user-visible") { queues[queues[priority] ? priority : "user-visible"].push(task); request(); } };
}
