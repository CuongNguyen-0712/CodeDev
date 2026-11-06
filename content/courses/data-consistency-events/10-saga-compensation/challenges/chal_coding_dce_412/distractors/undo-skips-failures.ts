// @piece compensate: Undo the finished steps
for (const step of [...rec.done].reverse()) {
    const comp = UNDO[step];
    if (!comp || rec.undone.includes(comp)) continue;
    if (attempt(ctx, comp, rec.order) !== null) {
        continue; // move on to the next compensation
    }
    rec.undone.push(comp);
    ctx.save(rec);
}
rec.status = "aborted";
ctx.save(rec);
