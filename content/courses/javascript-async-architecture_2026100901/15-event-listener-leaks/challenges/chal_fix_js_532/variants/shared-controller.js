// Wrong variant: one AbortController for the whole module. Unmounting any widget aborts the
// listeners of every widget, and every widget mounted afterwards registers with an
// already-aborted signal, so its listeners are never added at all.
const widgetController = new AbortController();

function mountWidget(target, store, timers) {
  const view = { clicks: 0, closed: false, price: null, polls: 0 };
  const { signal } = widgetController;
  function onKeyDown(event) { if (event.key === "Escape") view.closed = true; }
  target.addEventListener("click", () => { view.clicks += 1; }, { signal });
  target.addEventListener("keydown", onKeyDown, { capture: true, signal });
  const unsubscribe = store.subscribe((price) => { view.price = price; });
  const pollId = timers.setInterval(() => { view.polls += 1; }, 5000);
  return {
    view,
    unmount() {
      widgetController.abort();
      unsubscribe();
      timers.clearInterval(pollId);
    },
  };
}
