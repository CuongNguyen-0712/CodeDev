// @piece refill: Add the tokens earned since the last call
const current = now();
const elapsedMs = Math.max(0, current - last);
tokens = tokens + (elapsedMs * refillPerSecond) / 1000;
last = current;
