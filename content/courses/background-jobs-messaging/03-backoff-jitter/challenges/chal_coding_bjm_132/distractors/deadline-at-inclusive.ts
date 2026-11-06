// @piece deadline-check: Give up if the retry would miss the deadline
const retryAt = endAt + delayMs;
if (retryAt >= deadlineAt) {
    log.push({ attempt: n, startAt, endAt, outcome: "deadline", delayMs, retryAt });
    break;
}
