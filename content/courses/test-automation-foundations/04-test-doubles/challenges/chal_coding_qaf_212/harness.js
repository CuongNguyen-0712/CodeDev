// Harness: Build your own spy (a subset of t.mock.fn)
//   input: { case: "records" | "throws" | "once" | "reset" }  -> exercises createSpy directly
//          { case: "service", service: "correct" | "<bug name>" } -> uses createSpy as the mailer
//            double in a small password-reset test suite
//   output (direct cases): what the spy returned and recorded, in JSON-friendly form
//   output (service):      "passed" | "failed: <message>" for the correct service,
//                          "bug caught" | "bug survived" for a buggy one
// Any exception thrown by the learner's code becomes "failed: <message>".
async function __harness(input) {
    const show = (value) => {
        if (value === undefined) return "(undefined)";
        if (value instanceof Promise) return "(promise)";
        return value;
    };
    const describeError = (error) =>
        error === undefined ? null : error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    const describeThis = (value) =>
        value && typeof value === "object" && typeof value.label === "string"
            ? value.label
            : value === undefined
              ? "(undefined)"
              : "(other)";
    const describeCall = (call) => ({
        arguments: Array.isArray(call.arguments) ? call.arguments.map(show) : "not an array",
        result: show(call.result),
        error: describeError(call.error),
    });
    // `this` is only compared where the test sets it explicitly (a plain call's this depends on strict mode).
    const describeCallWithThis = (call) => ({ ...describeCall(call), this: describeThis(call.this) });

    try {
        if (input.case === "records") {
            const spy = createSpy(function (sku, qty) {
                return `${this.label}:${sku}x${qty}`;
            });
            const cart = { label: "cart", add: spy };
            const returned = [cart.add("MUG-01", 2), spy.call({ label: "wishlist" }, "TEE-02", 1)];
            return { returned, callCount: spy.mock.callCount(), calls: spy.mock.calls.map(describeCallWithThis) };
        }

        if (input.case === "throws") {
            let thrown;
            const spy = createSpy((qty) => {
                if (qty < 1) {
                    thrown = new RangeError(`qty must be >= 1, got ${qty}`);
                    throw thrown;
                }
                return qty * 1250;
            });
            const returned = [spy(2)];
            try {
                spy(0);
                returned.push("no error reached the caller");
            } catch (error) {
                returned.push(error === thrown ? "same error re-thrown" : "a different error was thrown");
            }
            returned.push(spy(3));
            return { returned, callCount: spy.mock.callCount(), calls: spy.mock.calls.map(describeCall) };
        }

        if (input.case === "once") {
            const spy = createSpy(() => "default");
            spy.mock.mockImplementationOnce(() => "first");
            spy.mock.mockImplementationOnce(() => "second");
            const returned = [spy(), spy(), spy()];
            spy.mock.mockImplementationOnce(() => "third");
            returned.push(spy(), spy());
            return { returned, callCount: spy.mock.callCount() };
        }

        if (input.case === "reset") {
            const spy = createSpy();
            const first = show(spy("a", 1));
            spy.mock.mockImplementationOnce(() => "queued");
            spy.mock.resetCalls();
            const afterReset = { callCount: spy.mock.callCount(), calls: spy.mock.calls.length };
            const next = [show(spy("b")), show(spy("c"))];
            return { first, afterReset, next, callCount: spy.mock.callCount(), calls: spy.mock.calls.map(describeCall) };
        }

        if (input.case === "service") {
            const createService = __service(input.service);
            try {
                await __resetSuite(createService);
            } catch (error) {
                if (input.service !== "correct") return "bug caught";
                return `failed: ${error && error.message}`;
            }
            return input.service === "correct" ? "passed" : "bug survived";
        }

        throw new Error(`unknown case ${input.case}`);
    } catch (error) {
        return `failed: ${error && error.message}`;
    }
}

// The password-reset service, in a correct and two buggy versions.
function __service(kind) {
    return function createPasswordReset({ users, tokens, mailer }) {
        return {
            async requestReset(email) {
                const user = await users.findByEmail(email);
                if (!user) return { status: "email sent" };
                const token = await tokens.create(user.id);
                const mail = { to: user.email, template: "password-reset", data: { token } };
                if (kind === "swallowsErrors") {
                    try {
                        await mailer.send(mail);
                    } catch (error) {
                        // the incident: logged and forgotten
                    }
                } else if (kind === "sendsTwice") {
                    // a "retry" that always runs twice
                    await mailer.send(mail);
                    await mailer.send(mail);
                } else if (kind === "correct") {
                    try {
                        await mailer.send(mail);
                    } catch (error) {
                        throw new Error("could not send the password-reset email", { cause: error });
                    }
                } else {
                    throw new Error(`unknown service ${kind}`);
                }
                return { status: "email sent" };
            },
        };
    };
}

// A test suite for the service that uses the learner's spy as the mailer double.
async function __resetSuite(createService) {
    const check = (condition, message) => {
        if (!condition) throw new Error(message);
    };
    const users = {
        async findByEmail(email) {
            return email === "ana@shop.test" ? { id: 7, email } : null;
        },
    };
    const tokens = {
        async create(userId) {
            return `tok-${userId}`;
        },
    };

    // 1. Happy path: exactly one email, to the owner, with the token.
    const mailer = { label: "mailer", send: createSpy(async () => ({ id: "msg-1" })) };
    const result = await createService({ users, tokens, mailer }).requestReset("ana@shop.test");
    check(result && result.status === "email sent", 'happy path: expected { status: "email sent" }');
    check(mailer.send.mock.callCount() === 1, `happy path: expected 1 email, the spy recorded ${mailer.send.mock.callCount()}`);
    const call = mailer.send.mock.calls[0];
    const mail = call && Array.isArray(call.arguments) ? call.arguments[0] : undefined;
    check(
        mail && mail.to === "ana@shop.test" && mail.template === "password-reset" && mail.data && mail.data.token === "tok-7",
        "happy path: the recorded email has the wrong recipient, template or token",
    );
    check(call.this === mailer, "happy path: the recorded call has the wrong this");

    // 2. Unknown address: same answer, nothing sent.
    const quiet = { send: createSpy() };
    const unknown = await createService({ users, tokens, mailer: quiet }).requestReset("nobody@shop.test");
    check(unknown && unknown.status === "email sent", 'unknown email: expected { status: "email sent" }');
    check(quiet.send.mock.callCount() === 0, "unknown email: no email should be sent");

    // 3. Mailer outage for one call, then the provider recovers.
    const flaky = { send: createSpy(async () => ({ id: "msg-2" })) };
    flaky.send.mock.mockImplementationOnce(async () => {
        throw new Error("SMTP 421: service not available");
    });
    const service = createService({ users, tokens, mailer: flaky });
    let outcome = "resolved";
    try {
        await service.requestReset("ana@shop.test");
    } catch (error) {
        outcome = "rejected";
    }
    check(outcome === "rejected", "mailer outage: requestReset resolved, so the mailer error was swallowed");
    check(flaky.send.mock.callCount() === 1, `mailer outage: expected 1 send attempt, the spy recorded ${flaky.send.mock.callCount()}`);
    const retry = await service.requestReset("ana@shop.test");
    check(
        retry && retry.status === "email sent" && flaky.send.mock.callCount() === 2,
        "after the outage: the next request should send the email (2 recorded calls in total)",
    );
}
