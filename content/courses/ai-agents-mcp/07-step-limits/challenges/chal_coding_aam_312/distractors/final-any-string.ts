// @piece final: A reply that is not a tool call must be a real answer
const call = asToolCall(raw);
if (!call) {
    const final = raw !== null && typeof raw === "object" ? (raw as { final?: unknown }).final : undefined;
    if (typeof final === "string") return stop("final", final);
    return stop("no_final_answer");
}
