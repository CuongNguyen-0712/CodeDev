// @piece issue-once: Issue it at most once
if (db.hasProcessed(key)) return "duplicate";
db.insertCertificate({ userId, courseId, jobId: job.id });
db.publishEvent({ type: "certificate.issued", userId, courseId });
db.markProcessed(key);
return "issued";
