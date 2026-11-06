// @piece extract-header: Read and validate traceparent
const value = headers.traceparent;
if (value === undefined) return null;
const match = /^00-([0-9a-f]{32})-([0-9a-f]{16})-[0-9a-f]{2}$/.exec(value);
if (!match) return null;
const [, traceId, spanId] = match;
return { traceId, spanId };
