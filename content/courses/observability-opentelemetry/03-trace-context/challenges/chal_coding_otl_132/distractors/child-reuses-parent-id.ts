// @piece child-headers: Headers for the outgoing call
const parent = parseTraceparent(incoming.traceparent);
if (!parent) return { traceparent: `00-${newId(ids.traceId)}-${newId(ids.spanId)}-01`, tracestate: null };
const state = incoming.tracestate !== null && validTracestate(incoming.tracestate) ? incoming.tracestate : null;
return { traceparent: `00-${parent.traceId}-${parent.parentId}-${parent.sampled ? "01" : "00"}`, tracestate: state };
