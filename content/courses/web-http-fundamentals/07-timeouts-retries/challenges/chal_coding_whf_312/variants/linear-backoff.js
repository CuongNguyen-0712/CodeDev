// Wrong variant: right statuses and limit, but the delay grows linearly (100, 200, 300)
// instead of doubling, and Retry-After is ignored.
async function fetchWithRetry(request, { fetch, sleep, retries = 3, baseDelayMs = 100 }) {
  for (let attempt = 1; ; attempt++) {
    let response;
    try {
      response = await fetch(request);
    } catch (error) {
      if (error.name === "AbortError" || attempt > retries) throw error;
      await sleep(baseDelayMs * attempt);
      continue;
    }
    if (![429, 502, 503, 504].includes(response.status) || attempt > retries) return response;
    await sleep(baseDelayMs * attempt);
  }
}
