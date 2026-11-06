// @piece local-day: Shift the instant to the learner's local date
return new Date(Date.parse(at) - utcOffsetMinutes * 60_000).toISOString().slice(0, 10);
