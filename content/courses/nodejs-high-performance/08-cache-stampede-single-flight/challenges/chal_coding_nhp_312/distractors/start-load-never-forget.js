// @piece start-load: Start the load and forget the key when it settles
const promise = Promise.resolve().then(() => fn(key));
