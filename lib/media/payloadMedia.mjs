/**
 * Client for the Payload CMS `media` collection REST API. Plain ESM, node builtins only (no `@/`
 * alias): the app and the content tools (plain `node`) share it.
 */

export function payloadConfig(env = process.env) {
    const baseUrl = String(env.PAYLOAD_URL || "").trim().replace(/\/+$/, "");
    const apiKey = String(env.PAYLOAD_API_KEY || "").trim();
    return baseUrl && apiKey ? { baseUrl, apiKey } : null;
}

const authHeaders = (apiKey) => ({ Authorization: `users API-Key ${apiKey}` });

async function fail(response, action) {
    const error = new Error(`Payload ${action} failed: ${response.status}`);
    error.status = response.status;
    error.body = await response.text().catch(() => "");
    throw error;
}

export async function findByKey({ baseUrl, apiKey, key }) {
    const query = new URLSearchParams({ "where[key][equals]": key, limit: "1" });
    const response = await fetch(`${baseUrl}/api/media?${query}`, { headers: authHeaders(apiKey) });
    if (!response.ok) await fail(response, "lookup");
    return (await response.json()).docs?.[0] ?? null;
}

export async function deleteFromPayload({ baseUrl, apiKey, id }) {
    const response = await fetch(`${baseUrl}/api/media/${encodeURIComponent(id)}`, { method: "DELETE", headers: authHeaders(apiKey) });
    if (response.status === 404) return "not found";
    if (!response.ok) await fail(response, "delete");
    return "ok";
}

/** Uploads a file; an existing doc with the same `key` is deleted first (replace semantics). */
export async function uploadToPayload({ baseUrl, apiKey, buffer, filename, mime, key, purpose, alt }) {
    const existing = await findByKey({ baseUrl, apiKey, key });
    if (existing) await deleteFromPayload({ baseUrl, apiKey, id: existing.id });

    const form = new FormData();
    form.append("file", new Blob([buffer], { type: mime }), filename);
    form.append("_payload", JSON.stringify({ key, purpose, ...(alt ? { alt } : {}) }));
    const response = await fetch(`${baseUrl}/api/media`, { method: "POST", headers: authHeaders(apiKey), body: form });
    if (!response.ok) await fail(response, "upload");

    const { doc } = await response.json();
    // doc.url is relative and the filename may have been renamed: use the returned url as is.
    return {
        id: doc.id,
        url: new URL(doc.url, baseUrl).href,
        width: doc.width ?? null,
        height: doc.height ?? null,
        mimeType: doc.mimeType,
        filesize: doc.filesize ?? null,
    };
}
