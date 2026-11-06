// @piece policy-checks: Issuer, audience, lifetime and time window
if (iss !== options.issuer) return fail("wrong issuer");
if (typeof aud === "string" ? aud !== options.audience : !(aud as string[]).includes(options.audience)) return fail("wrong audience");
if (expiresAt - issuedAt > options.maxLifetimeSeconds) return fail("lifetime too long");
if (now >= expiresAt) return fail("expired");
if (issuedAt > now + options.leewaySeconds) return fail("not yet valid");
return { valid: true, sub };
