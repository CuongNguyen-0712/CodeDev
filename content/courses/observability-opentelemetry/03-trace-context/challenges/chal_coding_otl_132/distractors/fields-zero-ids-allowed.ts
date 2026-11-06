// @piece parse-fields: Read and check the trace id, parent id and flags
const traceId = h.slice(3, 35);
const parentId = h.slice(36, 52);
const flags = h.slice(53, 55);
if (!isHex(traceId, 32) || h[35] !== "-" || !isHex(parentId, 16) || h[52] !== "-" || !isHex(flags, 2)) return null;
return { version, traceId, parentId, sampled: (parseInt(flags, 16) & 0x01) === 1 };
