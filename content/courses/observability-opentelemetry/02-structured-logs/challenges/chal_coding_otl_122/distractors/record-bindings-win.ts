// @piece write-record: Build and write one JSON record
if (levelValue(level) < threshold) return;
const record: Fields = { time: new Date(options.now()).toISOString(), level, msg: clean(msg) };
const span = options.activeSpan();
if (span) {
    record.trace_id = span.traceId;
    record.span_id = span.spanId;
}
const merged = { ...cleanObject(fields), ...cleanObject(bindings) };
for (const key of Object.keys(merged).sort()) {
    if (!RESERVED.has(key)) record[key] = merged[key];
}
options.write(JSON.stringify(record));
