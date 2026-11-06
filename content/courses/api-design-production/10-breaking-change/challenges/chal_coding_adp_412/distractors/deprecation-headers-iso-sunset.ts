// @piece deprecation-headers: Announce the deprecated fields
const MIN_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;
const deprecatedMs = Date.parse(policy.deprecatedAt);
if (Number.isNaN(deprecatedMs)) throw new Error(`invalid deprecatedAt: ${policy.deprecatedAt}`);
const headers: Record<string, string> = { Deprecation: `@${Math.floor(deprecatedMs / 1000)}` };
if (policy.sunsetAt === null) return headers;
const sunsetMs = Date.parse(policy.sunsetAt);
if (Number.isNaN(sunsetMs)) throw new Error(`invalid sunsetAt: ${policy.sunsetAt}`);
if (sunsetMs < deprecatedMs + MIN_WINDOW_MS) throw new Error("sunset is less than 14 days after deprecation");
headers.Sunset = new Date(sunsetMs).toISOString();
return headers;
