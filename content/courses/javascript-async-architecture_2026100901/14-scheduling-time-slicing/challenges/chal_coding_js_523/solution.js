/**
 * Reference solution (never shipped to learners).
 */
function createScheduler(options, host) {
  const sliceMs = options.sliceMs;
  const order = ["user-blocking", "user-visible", "background"];
  const queues = { "user-blocking": [], "user-visible": [], background: [] };
  let turnRequested = false;

  function nextQueue() {
    for (const priority of order) {
      if (queues[priority].length > 0) return queues[priority];
    }
    return null;
  }

  function requestTurn() {
    if (turnRequested) return;
    turnRequested = true;
    host.yieldToHost(runTurn);
  }

  function runTurn() {
    turnRequested = false;
    const turnStart = host.now();
    let queue;
    while ((queue = nextQueue())) {
      const entry = queue[0];
      const next = entry.fn();
      if (typeof next === "function") entry.fn = next;
      else queue.splice(queue.indexOf(entry), 1);

      if (host.now() - turnStart >= sliceMs) {
        if (nextQueue()) requestTurn();
        return;
      }
    }
  }

  function schedule(task, priority = "user-visible") {
    const level = order.includes(priority) ? priority : "user-visible";
    queues[level].push({ fn: task });
    requestTurn();
  }

  return { schedule };
}
