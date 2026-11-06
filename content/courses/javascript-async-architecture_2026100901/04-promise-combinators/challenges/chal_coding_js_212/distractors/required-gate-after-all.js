// @piece required-gate: Fail fast when a required source fails
const requiredGate = Promise.allSettled(attempts).then((settled) => {
  settled.forEach((outcome, i) => {
    if (sources[i].required && outcome.status === "rejected") {
      throw new Error(`${sources[i].name}: ${outcome.reason.message}`);
    }
  });
});
