// Wrong variant: fixes the inline-arrow click listener, but the keydown listener is still
// removed without { capture: true } and the store subscription is never released.
function mountWidget(target, store, timers) {
  const view = { clicks: 0, closed: false, price: null, polls: 0 };
  const onClick = () => { view.clicks += 1; };
  function onKeyDown(event) { if (event.key === "Escape") view.closed = true; }
  target.addEventListener("click", onClick);
  target.addEventListener("keydown", onKeyDown, { capture: true });
  store.subscribe((price) => { view.price = price; });
  const pollId = timers.setInterval(() => { view.polls += 1; }, 5000);
  return {
    view,
    unmount() {
      target.removeEventListener("click", onClick);
      target.removeEventListener("keydown", onKeyDown);
      timers.clearInterval(pollId);
    },
  };
}
