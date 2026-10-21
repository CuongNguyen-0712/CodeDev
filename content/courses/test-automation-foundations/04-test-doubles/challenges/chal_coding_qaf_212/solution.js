/**
 * Reference solution (never shipped to learners).
 */
function createSpy(impl = () => undefined) {
  const once = [];
  const mock = {
    calls: [],
    callCount() {
      return mock.calls.length;
    },
    mockImplementationOnce(fn) {
      once.push(fn);
    },
    resetCalls() {
      mock.calls = [];
    },
  };

  function spy(...args) {
    const current = once.length > 0 ? once.shift() : impl;
    try {
      const result = current.apply(this, args);
      mock.calls.push({ arguments: args, result, error: undefined, this: this });
      return result;
    } catch (error) {
      mock.calls.push({ arguments: args, result: undefined, error, this: this });
      throw error;
    }
  }

  spy.mock = mock;
  return spy;
}
