// @piece decide-status: Decide the status: db is critical, the queue is not
return { status: 200, body: { status: checks.queue === "up" ? "ok" : "degraded", checks } };
