// Wrong variant: a call that throws is re-thrown but never recorded, so callCount() counts only successful calls.
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
    const result = current.apply(this, args);
    mock.calls.push({ arguments: args, result, error: undefined, this: this });
    return result;
  }

  spy.mock = mock;
  return spy;
}
