// @piece coupon-check: Does the coupon apply to this course now?
if (!coupon) return false;
if (!Number.isInteger(coupon.percent) || coupon.percent < 1 || coupon.percent > 100) return false;
return coupon.courses === "all" || coupon.courses.includes(courseId);
