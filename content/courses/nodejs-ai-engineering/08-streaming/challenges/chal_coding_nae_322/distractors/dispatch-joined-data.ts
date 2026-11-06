// @piece dispatch: End an event: error, done, or a text delta
const dispatch = (): StreamResult | null => {
    const type = eventType || "message";
    const payload = data.join("");
    const hasData = data.length > 0;
    eventType = "";
    data = [];
    if (!hasData) return null;
    if (type === "error") return { status: "error", text, error: payload };
    if (type !== "message") return null; // ping, usage and other events are not part of the answer
    if (payload === "[DONE]") return { status: "complete", text, error: null };
    let parsed: unknown;
    try {
        parsed = JSON.parse(payload);
    } catch {
        return { status: "error", text, error: "malformed event" };
    }
    if (typeof parsed !== "object" || parsed === null || !("delta" in parsed) || typeof parsed.delta !== "string") {
        return { status: "error", text, error: "malformed event" };
    }
    text += parsed.delta;
    return null;
};
