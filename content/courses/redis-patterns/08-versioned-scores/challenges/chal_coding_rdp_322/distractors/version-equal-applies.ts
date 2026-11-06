// @piece compare-version: Compare with the stored version
const stored = Number(redis.hget(VERSIONS, learnerId) ?? "0");
if (version < stored) return "stale";
