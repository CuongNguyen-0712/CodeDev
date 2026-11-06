// @piece on-failure: What happens after a failed attempt
// keep it at the head and try again in 30 s
head.notBefore = now + RETRY_DELAY_SECONDS;
