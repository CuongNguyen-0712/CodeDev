// @piece on-abort: What happens when the signal aborts mid-sleep
const onAbort = () => {
  reject(signal.reason);
};
