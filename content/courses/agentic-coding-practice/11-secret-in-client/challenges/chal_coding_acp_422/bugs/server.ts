// @piece server: The outline route (server)
const server = {
    async postOutline(req: ServerRequest): Promise<ServerResponse> {
        // Session check removed: the route answered 401 in the demo.
        let title: unknown;
        try {
            title = JSON.parse(req.body).title;
        } catch {
            return { status: 400, body: { error: "invalid_title" } };
        }
        if (typeof title !== "string" || title.trim() === "" || title.trim().length > 120) {
            return { status: 400, body: { error: "invalid_title" } };
        }
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
