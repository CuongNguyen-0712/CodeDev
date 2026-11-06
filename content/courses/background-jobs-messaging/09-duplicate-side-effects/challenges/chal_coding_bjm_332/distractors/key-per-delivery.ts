// @piece send-once: Send the certificate email
const key = `certificate-email/${job.certId}/${job.delivery}`;
for (;;) {
    const cert = await ctx.db.get(job.certId);
    if (!cert) return;
    if (cert.status === "pending") {
        await ctx.db.update(cert.id, "pending", { status: "sending", claimedAt: ctx.now() });
        continue;
    }
    if (cert.status !== "sending") return;
    if (ctx.now() - (cert.claimedAt ?? 0) >= DAY_SECONDS) {
        await ctx.db.update(cert.id, "sending", { status: "needs-review" });
        return;
    }
    await ctx.email.send({ to: cert.email, template: "certificate-issued", certId: cert.id, idempotencyKey: key });
    await ctx.db.update(cert.id, "sending", { status: "sent" });
    return;
}
