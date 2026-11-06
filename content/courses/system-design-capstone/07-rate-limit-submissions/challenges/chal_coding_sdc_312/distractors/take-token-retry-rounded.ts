// @piece take-token: Take a token, or answer 429 with Retry-After
if (bucket.tokens >= TOKEN) {
    bucket.tokens -= TOKEN;
    return { status: 200, retryAfterSec: null, remaining: Math.floor(bucket.tokens / TOKEN) };
}
const waitMs = Math.ceil((TOKEN - bucket.tokens) / rate);
return { status: 429, retryAfterSec: Math.round(waitMs / 1000), remaining: Math.floor(bucket.tokens / TOKEN) };
