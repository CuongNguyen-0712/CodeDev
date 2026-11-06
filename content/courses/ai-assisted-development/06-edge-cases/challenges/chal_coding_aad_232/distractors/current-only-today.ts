// @piece current: The current streak
const today = localDay(Date.parse(now), offsetMinutes);
const current = sorted.length > 0 && previous === today ? run : 0;
return { current, longest };
