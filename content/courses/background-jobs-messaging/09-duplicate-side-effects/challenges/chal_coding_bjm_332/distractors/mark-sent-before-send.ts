// @piece send-once: Send the certificate email
const cert = await ctx.db.get(job.certId);
if (!cert || cert.status !== "pending") return;
if (!(await ctx.db.update(cert.id, "pending", { status: "sent" }))) return;
await ctx.email.send({ to: cert.email, template: "certificate-issued", certId: cert.id });
