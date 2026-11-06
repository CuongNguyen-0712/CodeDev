// @piece register: Listen, subscribe and keep a way to undo it
const controller = new AbortController();
const { signal } = controller;
target.addEventListener("click", () => { view.clicks += 1; }, { signal });
target.addEventListener("keydown", onKeyDown, { capture: true });
const unsubscribe = store.subscribe((price) => { view.price = price; });
let mounted = true;
