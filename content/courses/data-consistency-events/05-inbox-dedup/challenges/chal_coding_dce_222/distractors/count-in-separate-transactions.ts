// @piece handle-once: Count the certificate once per message id
if (this.db.tx((t) => t.inbox.has(msg.id))) return "duplicate";
const course = msg.payload.courseId;
this.db.tx((t) => { t.counters.set(course, (t.counters.get(course) ?? 0) + 1); });
this.db.tx((t) => { t.inbox.set(msg.id, { processedAt: now }); });
return "processed";
