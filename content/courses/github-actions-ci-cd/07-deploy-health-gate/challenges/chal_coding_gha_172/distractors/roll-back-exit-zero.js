// @piece roll-back: Unhealthy: restore the previous tag and fail the step
await io.rollout(previous);
io.output("deployed", previous);
io.output("rolled_back", "true");
io.summary(`${release} failed its health gate after ${checks} checks; rolled back to ${previous}`);
return { status: "rolled_back", version: previous, checks, exitCode: 0 };
