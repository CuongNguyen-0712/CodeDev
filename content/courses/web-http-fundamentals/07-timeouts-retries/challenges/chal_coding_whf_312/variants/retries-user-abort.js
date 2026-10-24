// Wrong variant: retries every rejected fetch, including an AbortError (the user already left
// the page), and treats Retry-After: 0 as "no header" because 0 is falsy.
async function fetchWithRetry(request, { fetch, sleep, retries = 3, baseDelayMs = 100 }) {
  for (let attempt = 1; ; attempt++) {
    let response;
    try {
      response = await fetch(request);
    } catch (error) {
      if (attempt > retries) throw error;
      await sleep(baseDelayMs * 2 ** (attempt - 1));
      continue;
    }
    if (![429, 502, 503, 504].includes(response.status) || attempt > retries) return response;
    const seconds = Number(response.headers.get("Retry-After"));
    await sleep(seconds ? seconds * 1000 : baseDelayMs * 2 ** (attempt - 1));
  }
}
