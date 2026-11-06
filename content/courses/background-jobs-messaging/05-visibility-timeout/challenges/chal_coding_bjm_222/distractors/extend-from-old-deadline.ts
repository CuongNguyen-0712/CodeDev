// @piece extend: Hide an in-flight message for longer
const m = this.current(receiptHandle);
if (!m || now >= m.visibleAt) return false; // not in flight any more
if (!Number.isInteger(timeoutMs) || timeoutMs < 0 || timeoutMs > MAX_VISIBILITY_MS) return false;
m.visibleAt += timeoutMs;
return true;
