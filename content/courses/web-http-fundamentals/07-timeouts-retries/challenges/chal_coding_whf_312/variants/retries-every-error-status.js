// Wrong variant (the incident): retries every response that is not ok, so 400, 401 and 500
// are sent again and again although the answer cannot change.
async function fetchWithRetry(request, { fetch, sleep, retries = 3, baseDelayMs = 100 }) {
  for (let attempt = 1; ; attempt++) {
    let response;
    try {
      response = await fetch(request);
    } catch (error) {
      if (error.name === "AbortError" || attempt > retries) throw error;
      await sleep(baseDelayMs * 2 ** (attempt - 1));
      continue;
    }
    if (response.ok || attempt > retries) return response;
    const retryAfter = response.headers.get("Retry-After");
    await sleep(retryAfter !== null && /^\d+$/.test(retryAfter) ? Number(retryAfter) * 1000 : baseDelayMs * 2 ** (attempt - 1));
  }
}
