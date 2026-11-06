// @piece compensate: Undo the finished steps
for (const step of rec.done) {
    const comp = UNDO[step];
    if (!comp || rec.undone.includes(comp)) continue;
    if (attempt(ctx, comp, rec.order) !== null) {
        rec.status = "stuck";
        ctx.save(rec);
        return;
    }
    rec.undone.push(comp);
    ctx.save(rec);
}
rec.status = "aborted";
ctx.save(rec);
