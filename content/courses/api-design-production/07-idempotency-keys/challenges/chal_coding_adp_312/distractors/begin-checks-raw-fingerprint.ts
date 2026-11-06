// @piece begin-checks: Check the key, then find a live record
if (typeof key !== "string" || key.length < 1 || key.length > 255) {
    return { kind: "reject", status: 400, code: "idempotency_key_missing" };
}
const id = this.id(userId, key);
const now = this.clock.now();
const fingerprint = createHash("sha256").update(JSON.stringify(body)).digest("hex");
let record = this.records.get(id);
if (record && record.state === "completed" && now - record.createdAt >= this.ttlMs) {
    this.records.delete(id);
    record = undefined;
}
