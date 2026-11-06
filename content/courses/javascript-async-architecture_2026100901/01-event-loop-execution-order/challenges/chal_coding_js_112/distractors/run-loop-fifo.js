// @piece run-loop: Run main, then every timer in due order
runGuarded(main, onError);
checkpoint(onError);

while (timers.size > 0) {
  const next = timers.values().next().value;
  timers.delete(next.id);
  clock = Math.max(clock, next.due);
  runGuarded(next.cb, onError);
  checkpoint(onError);
}
