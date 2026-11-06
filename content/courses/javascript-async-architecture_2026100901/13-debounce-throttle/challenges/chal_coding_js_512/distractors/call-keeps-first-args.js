// @piece call: Start or extend the burst on every call
const time = timers.now();
lastCallTime = time;
if (pendingArgs === null) pendingArgs = args;

if (timerId === null) {
  anchorTime = time;
  if (leading) invoke(time);
} else {
  timers.clearTimeout(timerId);
}
schedule(time);
