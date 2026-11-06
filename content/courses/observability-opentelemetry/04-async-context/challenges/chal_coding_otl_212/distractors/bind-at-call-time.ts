// @piece bind-context: Capture the context and run fn inside it
return (...args: A): R => store.run(store.active(), () => fn(...args));
