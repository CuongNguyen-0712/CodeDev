// @piece signature-check: Check the signature in constant time
if (typeof signature !== "string") return false;
const expected = createHmac("sha256", key).update(canonical, "utf8").digest();
return timingSafeEqual(expected, Buffer.from(signature, "hex"));
