// @piece reserve-key: Reserve the key for this request
await Promise.resolve();
const reserved = { fingerprint, state: "in_flight" };
records.set(key, reserved);
