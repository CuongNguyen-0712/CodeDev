// @piece send-once: Send the certificate email
const cert = await ctx.db.get(job.certId);
if (!cert || cert.status !== "pending") return;
await ctx.email.send({ to: cert.email, template: "certificate-issued", certId: cert.id, idempotencyKey: `certificate-email/${cert.id}` });
await ctx.db.update(cert.id, "pending", { status: "sent" });
