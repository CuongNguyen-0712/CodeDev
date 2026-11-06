// @piece server: The outline route (server)
const OUTLINES_PER_MINUTE = 5;
// shortcut: in-memory fixed window per process, move to Redis or the database with more than one server.
const usage = new Map<string, number>();

const server = {
    async postOutline(req: ServerRequest): Promise<ServerResponse> {
        if (!req.user) return { status: 401, body: { error: "unauthenticated" } };
        let title: unknown;
        try {
            title = JSON.parse(req.body).title;
        } catch {
            return { status: 400, body: { error: "invalid_title" } };
        }
        if (typeof title !== "string" || title.trim() === "" || title.trim().length > 120) {
            return { status: 400, body: { error: "invalid_title" } };
        }
        const bucket = `${Math.floor(clock.now / 60_000)}`;
        const used = usage.get(bucket) ?? 0;
        if (used >= OUTLINES_PER_MINUTE) return { status: 429, body: { error: "rate_limited" } };
        usage.set(bucket, used + 1);

        const res = await serverFetch("https://api.ai-vendor.test/v1/outline", {
            method: "POST",
            headers: { authorization: `Bearer ${serverEnv.AI_API_KEY}`, "content-type": "application/json" },
            body: JSON.stringify({ topic: title.trim(), sections: 3 }),
        });
        if (res.status !== 200) return { status: 502, body: { error: "upstream_error" } };
        const data = await res.json();
        return { status: 200, body: { outline: data.sections } };
    },
};
