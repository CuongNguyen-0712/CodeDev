// @piece client: The studio button that asks for an outline (browser)
const client = {
    vendorKey: publicEnv.NEXT_PUBLIC_AI_API_KEY, // kept for later
    async suggestOutline(title: string): Promise<SuggestResult> {
        const res = await browserFetch("/api/outline", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ title }),
        });
        const data = await res.json();
        if (res.status !== 200) return { ok: false, status: res.status, error: String(data.error) };
        return { ok: true, outline: data.outline };
    },
};
