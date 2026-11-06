// @piece roll-back: Undo this delivery's change only
if (ctx.snapshot) cache.set(KEY, ctx.snapshot);
