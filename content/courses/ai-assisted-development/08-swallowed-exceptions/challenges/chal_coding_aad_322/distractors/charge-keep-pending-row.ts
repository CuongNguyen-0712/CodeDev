// @piece charge: Charge the learner, and handle a failed charge
const context = (reason: string): LogContext => ({
    enrollmentId: enrollment.id,
    userId: req.userId,
    courseId: req.courseId,
    reason,
});

let chargeId: string;
try {
    ({ chargeId } = await deps.gateway.charge({
        paymentMethodId: req.paymentMethodId,
        amountVnd: req.priceVnd,
        idempotencyKey: enrollment.id,
    }));
} catch (error) {
    if (error instanceof PaymentDeclinedError) {
        deps.logger.warn("payment_declined", context(error.code));
        return { status: "payment_declined", code: error.code };
    }
    deps.logger.error("payment_failed", context(messageOf(error)));
    throw error;
}
