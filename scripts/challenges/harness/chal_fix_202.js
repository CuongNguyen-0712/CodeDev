// Harness: Fix Unhandled Rejection in Payment Webhook
// safeProcessPayment(promise) must always resolve:
//   resolved -> { success: true, data }
//   rejected -> { success: false, error: <message> } for Error and non-Error reasons.
async function __harness(input, ctx) {
    async function attempt(makeSource) {
        try {
            return await safeProcessPayment(makeSource());
        } catch (error) {
            return { unhandled: true, error: String((error && error.message) || error) };
        }
    }

    if (input.action === "resolve") {
        return attempt(() => Promise.resolve(input.value));
    }

    // Rejections must be handled the same way whether the reason is an Error or a raw value.
    const withError = await attempt(() => Promise.reject(new Error(input.error)));
    const withValue = await attempt(() => Promise.reject(input.error));

    await ctx.sleep(0);
    if (ctx.unhandledRejections().length > 0) {
        return { unhandled: true, error: "Unhandled promise rejection" };
    }

    return JSON.stringify(withError) === JSON.stringify(withValue)
        ? withError
        : { inconsistent: true, withError, withValue };
}
