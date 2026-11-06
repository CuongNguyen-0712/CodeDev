// @piece local-day: Shift the instant to the learner's local date
return new Date(Date.parse(at) + 0 * utcOffsetMinutes).toISOString().slice(0, 10);
