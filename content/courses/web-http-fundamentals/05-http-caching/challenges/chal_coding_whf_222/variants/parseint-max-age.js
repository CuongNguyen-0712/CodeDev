// Wrong variant: splits and lowercases correctly, but converts max-age with parseInt,
// which accepts "1.5" (1), "60s" (60) and "-1" (-1) instead of rejecting them.
function parseCacheControl(header) {
  const result = { maxAge: null, noStore: false, noCache: false, private: false, public: false };
  if (!header) return result;
  for (const item of header.split(",")) {
    const [rawName, rawValue = ""] = item.trim().split("=");
    const name = rawName.trim().toLowerCase();
    const value = rawValue.trim().replace(/^"|"$/g, "");
    if (name === "max-age") {
      const n = parseInt(value, 10);
      result.maxAge = Number.isNaN(n) ? null : Math.min(n, 2147483648);
    } else if (name === "no-store") result.noStore = true;
    else if (name === "no-cache") result.noCache = true;
    else if (name === "private") result.private = true;
    else if (name === "public") result.public = true;
  }
  return result;
}
