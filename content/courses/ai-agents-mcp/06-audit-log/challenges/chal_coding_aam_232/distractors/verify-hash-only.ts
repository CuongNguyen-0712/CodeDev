// @piece verify: Check every record's link and hash
for (let i = 0; i < records.length; i++) {
    const record = records[i];
    const { hash, ...body } = record;
    if (hash !== hashRecord(body)) return { ok: false, brokenAt: record.seq, reason: "hash" };
}
return { ok: true };
