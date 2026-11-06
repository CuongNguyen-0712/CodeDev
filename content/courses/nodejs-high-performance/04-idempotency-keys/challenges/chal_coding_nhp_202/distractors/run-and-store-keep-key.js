// @piece run-and-store: Run the charge and keep its result
const result = await fn();
records.set(key, { fingerprint, state: "completed", result, expiresAt: now() + ttlMs });
return { replayed: false, result };
