// @piece teardown: Undo everything the widget registered
if (!mounted) return;
mounted = false;
controller.abort();
timers.clearInterval(pollId);
