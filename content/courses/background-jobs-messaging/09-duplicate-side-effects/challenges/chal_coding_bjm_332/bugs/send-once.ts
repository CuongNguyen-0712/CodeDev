// @piece send-once: Send the certificate email
const cert = await ctx.db.get(job.certId);
if (!cert || cert.status !== "pending") return; // already sent, or unknown certificate
await ctx.email.send({ to: cert.email, template: "certificate-issued", certId: cert.id });
await ctx.db.update(cert.id, "pending", { status: "sent" });
