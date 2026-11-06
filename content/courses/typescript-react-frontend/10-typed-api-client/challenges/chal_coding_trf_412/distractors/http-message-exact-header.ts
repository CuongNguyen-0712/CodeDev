// @piece http-message: A message for a failed HTTP status
const type = headers["content-type"] ?? "";
if (type.toLowerCase().startsWith("application/problem+json")) {
    try {
        const problem: unknown = JSON.parse(body);
        if (isRecord(problem)) {
            if (typeof problem.detail === "string") return problem.detail;
            if (typeof problem.title === "string") return problem.title;
        }
    } catch {
        // a broken problem body falls back to the status
    }
}
return `HTTP ${status}`;
