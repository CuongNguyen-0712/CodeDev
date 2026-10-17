// Wrong variant: every reference is right and the store is unsubscribed, but the capture
// listener is removed as a bubble listener - removeEventListener matches on (type, listener, capture).
function mountWidget(target, store, timers) {
  const view = { clicks: 0, closed: false, price: null, polls: 0 };
  const onClick = () => { view.clicks += 1; };
  function onKeyDown(event) { if (event.key === "Escape") view.closed = true; }
  target.addEventListener("click", onClick);
  target.addEventListener("keydown", onKeyDown, { capture: true });
  const unsubscribe = store.subscribe((price) => { view.price = price; });
  const pollId = timers.setInterval(() => { view.polls += 1; }, 5000);
  return {
    view,
    unmount() {
      target.removeEventListener("click", onClick);
      target.removeEventListener("keydown", onKeyDown, { once: true });
      unsubscribe();
      timers.clearInterval(pollId);
    },
  };
}
