// Harness: asks the learner's corsHeaders(requestOrigin, allowlist) for the headers of each request.
// input.allowlist: trusted origins. input.requests: Origin header values (null = no Origin header).
// input.view decides what the test looks at, one entry per request:
//   "basic"   -> { allowOrigin: <is Access-Control-Allow-Origin present>, allowCredentials: <its value or null> }
//   "full"    -> { allowOrigin: <value or null>, allowCredentials: <value or null>, varyOrigin: <Vary lists Origin> }
//   "browser" -> "readable" | "blocked": the browser's CORS check for a fetch with credentials: "include"
// Header names are compared case-insensitively, values exactly.
async function __harness(input) {
    return input.requests.map((origin) => {
        const raw = corsHeaders(origin, input.allowlist.slice()) || {};
        const headers = {};
        for (const [name, value] of Object.entries(raw)) headers[name.toLowerCase()] = value;
        const allowOrigin = headers["access-control-allow-origin"] ?? null;
        const allowCredentials = headers["access-control-allow-credentials"] ?? null;
        if (input.view === "basic") return { allowOrigin: allowOrigin !== null, allowCredentials };
        if (input.view === "browser") {
            // Fetch standard CORS check, credentials mode "include": exact origin, never "*", credentials "true".
            const ok = typeof origin === "string" && origin !== "null" && allowOrigin === origin && allowCredentials === "true";
            return ok ? "readable" : "blocked";
        }
        const vary = String(headers["vary"] ?? "");
        const varyOrigin = vary.split(",").some((token) => token.trim().toLowerCase() === "origin");
        return { allowOrigin, allowCredentials, varyOrigin };
    });
}
