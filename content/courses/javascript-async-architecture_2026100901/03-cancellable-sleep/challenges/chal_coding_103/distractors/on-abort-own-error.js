// @piece on-abort: What happens when the signal aborts mid-sleep
const onAbort = () => {
  timers.clearTimeout(id);
  reject(new Error("Sleep aborted"));
};
