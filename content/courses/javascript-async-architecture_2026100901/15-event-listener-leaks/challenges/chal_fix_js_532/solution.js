/**
 * Reference solution (never shipped to learners).
 */
function mountWidget(target, store, timers) {
  const view = { clicks: 0, closed: false, price: null, polls: 0 };
  const controller = new AbortController();
  const { signal } = controller;

  function onKeyDown(event) {
    if (event.key === "Escape") view.closed = true;
  }

  target.addEventListener("click", () => { view.clicks += 1; }, { signal });
  target.addEventListener("keydown", onKeyDown, { capture: true, signal });
  const unsubscribe = store.subscribe((price) => { view.price = price; });
  const pollId = timers.setInterval(() => { view.polls += 1; }, 5000);

  let mounted = true;
  return {
    view,
    unmount() {
      if (!mounted) return;
      mounted = false;
      controller.abort();
      unsubscribe();
      timers.clearInterval(pollId);
    },
  };
}
