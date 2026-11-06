// @piece signature-check: Check the signature
const expected = createHmac("sha256", secret).update(`${parts[0]}.${parts[1]}`).digest();
const received = Buffer.from(parts[2], "base64url");
if (expected.length !== received.length || !timingSafeEqual(expected, received)) return fail("bad signature");
