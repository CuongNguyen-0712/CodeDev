// @piece apply-once: Apply the event once per partition offset
// The offset check and both writes in ONE transaction: a crash or a second deliverer
// can never see the score without the offset that explains it.
return this.db.tx((tx): "applied" | "skipped" => {
    const offsetKey = `${version}/${p}`;
    const last = tx.get<number>("offsets", offsetKey);
    if (last !== undefined && o < last) return "skipped";
    const scoreKey = `${version}/${learner}`;
    tx.put("scores", scoreKey, (tx.get<number>("scores", scoreKey) ?? 0) + points);
    tx.put("offsets", offsetKey, o);
    return "applied";
});
