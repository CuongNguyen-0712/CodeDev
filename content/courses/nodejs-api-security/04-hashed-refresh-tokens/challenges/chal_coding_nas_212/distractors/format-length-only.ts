// @piece format-and-lookup: Check the format, then find the row by hash
if (typeof presented !== "string") return reject("malformed");
const hash = sha256Hex(presented);
const row = deps.store.findByHash(hash);
if (!row || !timingSafeEqual(Buffer.from(row.tokenHash, "hex"), Buffer.from(hash, "hex"))) return reject("unknown");
