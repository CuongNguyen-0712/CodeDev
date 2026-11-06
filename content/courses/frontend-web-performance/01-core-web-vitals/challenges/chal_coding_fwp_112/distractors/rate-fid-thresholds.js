// @piece rate: Good, needs improvement or poor by the metric's thresholds
const [good, poor] = name === "INP" ? [100, 300] : THRESHOLDS[name];
const rating = p75 <= good ? "good" : p75 <= poor ? "needs-improvement" : "poor";
