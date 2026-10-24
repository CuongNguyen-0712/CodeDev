/**
 * Reference solution (never shipped to learners).
 */
async function loadProgress(userId, { fetch, cache }) {
  const key = `progress:${userId}`;
  const url = `https://api.codedev.test/users/${userId}/progress`;

  let res;
  try {
    res = await fetch(url, { credentials: "include" });
  } catch {
    return fallback(cache.get(key), null); // no response at all
  }

  if (res.ok) {
    const data = await res.json();
    cache.set(key, data);
    return { status: "fresh", data };
  }
  if (res.status === 401) return { status: "signed_out" }; // same token, same answer: do not retry
  if (res.status >= 500) return fallback(cache.get(key), res.status);
  return { status: "error", httpStatus: res.status };
}

function fallback(cached, httpStatus) {
  return cached === undefined ? { status: "error", httpStatus } : { status: "stale", data: cached };
}
