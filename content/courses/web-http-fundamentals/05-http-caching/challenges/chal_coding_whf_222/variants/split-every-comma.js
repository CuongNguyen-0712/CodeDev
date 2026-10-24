// Wrong variant: correct per directive, but splits at every comma, so a comma inside a
// quoted value creates fake directives: no-cache="Set-Cookie, public, Authorization" turns on public.
function parseCacheControl(header) {
  const result = { maxAge: null, noStore: false, noCache: false, private: false, public: false };
  if (!header) return result;
  for (const item of header.split(",")) {
    const directive = item.trim();
    if (!directive) continue;
    const eq = directive.indexOf("=");
    const name = (eq === -1 ? directive : directive.slice(0, eq)).toLowerCase();
    const value = eq === -1 ? null : directive.slice(eq + 1).replace(/^"(.*)"$/, "$1");
    if (name === "max-age") result.maxAge = value !== null && /^\d+$/.test(value) ? Math.min(Number(value), 2147483648) : null;
    else if (name === "no-store") result.noStore = true;
    else if (name === "no-cache") result.noCache = true;
    else if (name === "private") result.private = true;
    else if (name === "public") result.public = true;
  }
  return result;
}
