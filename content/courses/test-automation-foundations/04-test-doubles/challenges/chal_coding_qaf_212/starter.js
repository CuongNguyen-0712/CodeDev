/**
 * Build your own spy: a small subset of node:test's t.mock.fn.
 *
 * createSpy(impl = () => undefined) returns a function `spy`. Every time `spy` is called it:
 *   1. picks the implementation to run: the oldest function queued with mockImplementationOnce
 *      (and removes it from the queue), or `impl` when the queue is empty;
 *   2. calls it with the same `this` and the same arguments the spy received;
 *   3. records the call in spy.mock.calls as an object
 *        { arguments, result, error, this }
 *      - arguments: a real array with the arguments of this call (e.g. ["ana@shop.test", 2])
 *      - result:    what the implementation returned (undefined when it threw)
 *      - error:     what the implementation threw (undefined when it returned)
 *      - this:      the `this` value of the call
 *   4. returns the result - or, when the implementation threw, records the error and then
 *      re-throws THE SAME error object, so the code under test still sees the failure.
 *
 * Async implementations need nothing special: an async function returns a promise, so the
 * promise is the recorded `result` (even when it later rejects) and the caller awaits it.
 *
 * spy.mock also has:
 *   callCount()               the number of recorded calls, including calls that threw
 *   mockImplementationOnce(f) queue f for ONE future call; several calls queue several
 *                             functions, used in the order they were queued, then `impl` again
 *                             (note: node:test's own version does not queue - see the lesson)
 *   resetCalls()              forget every recorded call (spy.mock.calls is empty afterwards);
 *                             keeps `impl` and anything still queued
 *
 * Example:
 *   const send = createSpy(async (mail) => ({ id: "msg-1" }));
 *   send.mock.mockImplementationOnce(async () => { throw new Error("SMTP 421"); });
 *   await send({ to: "ana@shop.test" });   // rejects with SMTP 421 (queued implementation)
 *   await send({ to: "ana@shop.test" });   // { id: "msg-1" }
 *   send.mock.callCount();                 // 2
 *   send.mock.calls[0].arguments;          // [{ to: "ana@shop.test" }]
 *
 * The grader checks your spy directly and then uses it as the mailer double in a test of a
 * password-reset service: with a working spy, that test passes for the correct service and
 * fails for the service that swallows mailer errors.
 *
 * @param {Function} [impl] the default implementation
 * @returns {Function & { mock: { calls: Array<{ arguments: any[], result: any, error: any, this: any }>,
 *   callCount(): number, mockImplementationOnce(fn: Function): void, resetCalls(): void } }}
 */
function createSpy(impl = () => undefined) {
  const calls = [];

  function spy(...args) {
    // TODO: use the once-queue, record every call (also the ones that throw), re-throw errors.
    return impl.apply(this, args);
  }

  spy.mock = {
    calls,
    callCount() {
      return 0; // TODO
    },
    mockImplementationOnce(fn) {
      // TODO
    },
    resetCalls() {
      // TODO
    },
  };
  return spy;
}
