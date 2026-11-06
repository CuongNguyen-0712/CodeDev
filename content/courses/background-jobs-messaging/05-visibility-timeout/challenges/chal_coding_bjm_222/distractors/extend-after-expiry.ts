// @piece extend: Hide an in-flight message for longer
const m = this.current(receiptHandle);
if (!m) return false;
if (!Number.isInteger(timeoutMs) || timeoutMs < 0 || timeoutMs > MAX_VISIBILITY_MS) return false;
m.visibleAt = now + timeoutMs; // counted from now, not from the old deadline
return true;
