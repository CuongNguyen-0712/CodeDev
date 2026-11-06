// @piece finish-request: Keep the answer, or forget a failed attempt
const id = this.id(userId, key);
const record = this.records.get(id);
if (!record) return;
record.state = "completed";
record.status = status;
record.body = body;
