// @piece client: The studio button that asks for an outline (browser)
const client = {
    async suggestOutline(title: string): Promise<SuggestResult> {
        // The route answered 401 in the demo, so call the AI vendor straight from the browser.
        const res = await browserFetch("https://api.ai-vendor.test/v1/outline", {
            method: "POST",
            headers: { authorization: `Bearer ${publicEnv.NEXT_PUBLIC_AI_API_KEY}`, "content-type": "application/json" },
            body: JSON.stringify({ topic: title, sections: 3 }),
        });
        const data = await res.json();
        if (res.status !== 200) return { ok: false, status: res.status, error: String(data.error) };
        return { ok: true, outline: data.sections };
    },
};
