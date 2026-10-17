/**
 * Mounts the live price widget of a product page.
 *
 * While mounted it must:
 *   - count clicks on `target`                       (view.clicks)
 *   - close on Escape, in the CAPTURE phase so inner inputs cannot swallow it (view.closed)
 *   - show the latest price pushed by `store`         (view.price)
 *   - poll for stock every 5 s                        (view.polls)
 *
 * unmount() must undo ALL of it: after unmount, nothing the widget registered may stay alive,
 * and calling unmount() twice must be harmless.
 *
 * BUG: every route change leaves something behind - after an hour of browsing the product
 * pages the tab is at 1.2 GB. Find every leak in unmount() and fix it.
 *
 * @param {EventTarget} target                   the widget's root element
 * @param {{ subscribe(listener: (price: number) => void): () => void }} store
 *        subscribe() returns an unsubscribe function
 * @param {{ setInterval(cb: () => void, ms: number): any, clearInterval(id: any): void }} timers
 * @returns {{ view: { clicks: number, closed: boolean, price: number | null, polls: number }, unmount(): void }}
 */
function mountWidget(target, store, timers) {
  const view = { clicks: 0, closed: false, price: null, polls: 0 };

  function onKeyDown(event) {
    if (event.key === "Escape") view.closed = true;
  }

  target.addEventListener("click", () => { view.clicks += 1; });
  target.addEventListener("keydown", onKeyDown, { capture: true });
  store.subscribe((price) => { view.price = price; });
  const pollId = timers.setInterval(() => { view.polls += 1; }, 5000);

  return {
    view,
    unmount() {
      target.removeEventListener("click", () => { view.clicks += 1; });
      target.removeEventListener("keydown", onKeyDown);
      timers.clearInterval(pollId);
    },
  };
}
