// @piece register: Listen, subscribe and keep a way to undo it
target.addEventListener("click", () => { view.clicks += 1; });
target.addEventListener("keydown", onKeyDown, { capture: true });
store.subscribe((price) => { view.price = price; });
