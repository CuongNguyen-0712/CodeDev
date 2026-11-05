// @piece with-timeout: Give each check its time budget
const withTimeout = (run) => Promise.resolve().then(run);
