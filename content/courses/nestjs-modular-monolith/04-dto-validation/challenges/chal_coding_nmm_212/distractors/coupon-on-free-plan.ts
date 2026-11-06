// @piece coupon: couponCode
let couponCode: string | undefined;
const coupon = b.couponCode;
if (!missing(coupon)) {
    if (typeof coupon !== "string") errors.push({ field: "couponCode", message: "couponCode must be a string" });
    else if (!COUPON.test(coupon)) errors.push({ field: "couponCode", message: "couponCode must be 4 to 12 characters, A-Z or 0-9" });
    else couponCode = coupon;
}
