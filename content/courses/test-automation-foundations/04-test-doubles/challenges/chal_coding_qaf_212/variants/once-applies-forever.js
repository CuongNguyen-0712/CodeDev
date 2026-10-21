// Wrong variant: mockImplementationOnce replaces the implementation for good instead of for one call.
function createSpy(impl = () => undefined) {
  let current = impl;
  const mock = {
    calls: [],
    callCount() {
      return mock.calls.length;
    },
    mockImplementationOnce(fn) {
      current = fn;
    },
    resetCalls() {
      mock.calls = [];
    },
  };

  function spy(...args) {
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
