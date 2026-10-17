/**
 * A tiny cooperative scheduler for the main thread (the idea behind React's scheduler and
 * scheduler.postTask).
 *
 * schedule(task, priority):
 *   - priority is "user-blocking" > "user-visible" > "background" (default "user-visible").
 *   - A task is a function. Calling it performs ONE unit of work. If it returns a function,
 *     that function is the continuation (the rest of the work); anything else means "done".
 *   - A continuation keeps its task's place: it runs before later tasks of the same priority.
 *
 * Running:
 *   - Work never runs inside schedule(). Ask the host for a turn with host.yieldToHost(callback);
 *     the host calls callback later, in its own task. Keep at most ONE host request pending.
 *   - In a turn, run units one by one. Before each unit pick the highest-priority task
 *     (FIFO within a priority) - tasks scheduled during the turn count too.
 *   - After a unit, if host.now() - turnStart >= sliceMs and work remains, request another
 *     turn and return, so input and rendering can run in between.
 *   - When the queue becomes empty, stop; a later schedule() requests a new turn.
 *
 * @param {{ sliceMs: number }} options
 * @param {{ now(): number, yieldToHost(callback: () => void): void }} host
 * @returns {{ schedule(task: () => any, priority?: "user-blocking" | "user-visible" | "background"): void }}
 */
function createScheduler(options, host) {
  const sliceMs = options.sliceMs;

  function schedule(task, priority = "user-visible") {
    // TODO: queue the task and make sure a host turn is requested
  }

  return { schedule };
}
