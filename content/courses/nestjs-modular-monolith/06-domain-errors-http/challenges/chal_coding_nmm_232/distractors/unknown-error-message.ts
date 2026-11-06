// @piece unknown-error: Anything else
// anything else is a bug until someone maps it: say nothing about it to the client
return problem(500, "internal-error", "Internal server error",
    error instanceof Error ? error.message : "An unexpected error occurred. Quote the correlation id when you contact support.");
