// @piece read-json: Read the body as JSON, then check it
if (body.trim() === "") return { ok: false, error: { kind: "invalid-response", reason: "empty body" } };
let json: unknown;
try {
    json = JSON.parse(body);
} catch {
    return { ok: false, error: { kind: "invalid-response", reason: "body is not JSON" } };
}
if (!Array.isArray(json)) return { ok: false, error: { kind: "invalid-response", reason: "expected an array" } };
return { ok: true, data: json as Course[] };
