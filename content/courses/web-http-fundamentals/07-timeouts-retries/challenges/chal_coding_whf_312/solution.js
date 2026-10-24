/**
 * Reference solution (never shipped to learners).
 */
async function fetchWithRetry(request, { fetch, sleep, retries = 3, baseDelayMs = 100 }) {
  for (let attempt = 1; ; attempt++) {
    let response;
    try {
      response = await fetch(request);
    } catch (error) {
      if ((error && error.name === "AbortError") || attempt > retries) throw error;
      await sleep(baseDelayMs * 2 ** (attempt - 1));
      continue;
    }
    if (!RETRYABLE_STATUSES.includes(response.status) || attempt > retries) return response;
    const retryAfter = response.headers.get("Retry-After");
    await sleep(retryAfter !== null && /^\d+$/.test(retryAfter)
      ? Number(retryAfter) * 1000
      : baseDelayMs * 2 ** (attempt - 1));
  }
}

const RETRYABLE_STATUSES = [429, 502, 503, 504];
