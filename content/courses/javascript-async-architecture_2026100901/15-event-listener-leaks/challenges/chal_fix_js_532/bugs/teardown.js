// @piece teardown: Undo everything the widget registered
target.removeEventListener("click", () => { view.clicks += 1; });
target.removeEventListener("keydown", onKeyDown);
timers.clearInterval(pollId);
