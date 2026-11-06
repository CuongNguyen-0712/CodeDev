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
    await deps.enrollments.remove(enrollment.id);
    const code = error instanceof PaymentDeclinedError ? error.code : "unknown";
    deps.logger.warn("payment_declined", context(code));
    return { status: "payment_declined", code };
}
