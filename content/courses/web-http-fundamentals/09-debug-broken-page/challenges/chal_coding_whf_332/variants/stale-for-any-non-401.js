// Wrong variant: 401 is handled, but every other failure (403, 404 ...) still serves the cache.
// A 404 for a deleted account or a 403 for a locked one would show old progress as if nothing happened.
async function loadProgress(userId, { fetch, cache }) {
  const key = `progress:${userId}`;
  let res = null;
  try {
    res = await fetch(`https://api.codedev.test/users/${userId}/progress`, { credentials: "include" });
  } catch {
    // no response
  }
  if (res && res.ok) {
    const data = await res.json();
    cache.set(key, data);
    return { status: "fresh", data };
  }
  if (res && res.status === 401) return { status: "signed_out" };
  const cached = cache.get(key);
  if (cached !== undefined) return { status: "stale", data: cached };
  return { status: "error", httpStatus: res ? res.status : null };
}
