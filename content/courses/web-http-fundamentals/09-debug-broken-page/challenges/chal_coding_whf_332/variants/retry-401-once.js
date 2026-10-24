// Wrong variant: handles 401 as signed_out, but only after retrying it once "in case the token
// was refreshed meanwhile". The retry sends the same expired token and doubles the 401s.
async function loadProgress(userId, { fetch, cache }) {
  const key = `progress:${userId}`;
  const url = `https://api.codedev.test/users/${userId}/progress`;
  for (let attempt = 0; attempt < 2; attempt++) {
    let res;
    try {
      res = await fetch(url, { credentials: "include" });
    } catch {
      const cached = cache.get(key);
      return cached === undefined ? { status: "error", httpStatus: null } : { status: "stale", data: cached };
    }
    if (res.ok) {
      const data = await res.json();
      cache.set(key, data);
      return { status: "fresh", data };
    }
    if (res.status === 401) {
      if (attempt === 0) continue;
      return { status: "signed_out" };
    }
    const cached = cache.get(key);
    if (res.status >= 500 && cached !== undefined) return { status: "stale", data: cached };
    return { status: "error", httpStatus: res.status };
  }
}
