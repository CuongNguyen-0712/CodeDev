// @piece known-key: Answer a key that is already known
if (record) {
  if (record.state === "in_flight") throw httpError(409, "IDEMPOTENCY_KEY_IN_PROGRESS");
  return { replayed: true, result: record.result };
}
