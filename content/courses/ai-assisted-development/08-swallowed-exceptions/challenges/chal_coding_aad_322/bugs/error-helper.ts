// @piece error-helper: Helper below the enrollment flow
async function chargeLearner(req: EnrollRequest, enrollmentId: string, deps: Deps): Promise<string | null> {
    try {
        const charge = await deps.gateway.charge({
            paymentMethodId: req.paymentMethodId,
            amountVnd: req.priceVnd,
            idempotencyKey: enrollmentId,
        });
        return charge.chargeId;
    } catch (e) {
        return null;
    }
}
