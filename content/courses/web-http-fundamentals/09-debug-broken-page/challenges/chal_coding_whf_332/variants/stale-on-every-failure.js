// Wrong variant: no more retries, but every failure - the 401 included - falls back to the cache.
// The expired session still shows old numbers, now with a "stale" label, and nobody signs in again.
async function loadProgress(userId, { fetch, cache }) {
  const key = `progress:${userId}`;
  let res;
  try {
    res = await fetch(`https://api.codedev.test/users/${userId}/progress`, { credentials: "include" });
  } catch {
    res = null;
  }
  if (res && res.ok) {
    const data = await res.json();
    cache.set(key, data);
    return { status: "fresh", data };
  }
  const cached = cache.get(key);
  if (cached !== undefined) return { status: "stale", data: cached };
  if (res && res.status === 401) return { status: "signed_out" };
  return { status: "error", httpStatus: res ? res.status : null };
}
