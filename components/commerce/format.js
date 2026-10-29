import { errorCode } from "@/clients/premium.client";
import { userMessage } from "@/lib/userMessage";

// Display helpers shared by the commerce components. Formatting uses a fixed locale so the
// server render and the browser render produce the same text (no hydration mismatch).
const LOCALE = "en-US";
const ZERO_DECIMAL_CURRENCIES = new Set(["VND", "JPY", "KRW"]);

/** Money is stored in minor units; VND/JPY/KRW have no decimals. */
export function formatMoney(amountMinor, currency = "VND") {
    const amount = Number(amountMinor);
    if (!Number.isFinite(amount)) return "";
    const code = String(currency || "VND").toUpperCase();
    const exp = ZERO_DECIMAL_CURRENCIES.has(code) ? 0 : 2;
    try {
        return new Intl.NumberFormat(LOCALE, {
            style: "currency",
            currency: code,
            minimumFractionDigits: exp,
            maximumFractionDigits: exp,
        }).format(amount / 10 ** exp);
    } catch {
        return `${(amount / 10 ** exp).toLocaleString(LOCALE)} ${code}`;
    }
}

export function formatPoints(points) {
    const value = Number(points);
    return `${(Number.isFinite(value) ? value : 0).toLocaleString(LOCALE)} pts`;
}

export function formatDate(value, { time = false } = {}) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleString(LOCALE, {
        year: "numeric",
        month: "short",
        day: "numeric",
        ...(time ? { hour: "2-digit", minute: "2-digit" } : {}),
    });
}

export function humanize(value) {
    if (!value) return "";
    const text = String(value).replace(/[_-]+/g, " ").trim();
    return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Offers of a course details response or a list item, in one shape. */
export function offersOf(course) {
    if (!course) return { money: null, points: null };
    if (course.offers) {
        const money = course.offers.money && Number.isFinite(Number(course.offers.money.amountMinor))
            ? course.offers.money
            : null;
        const pointsAmount = course.offers.points ? Number(course.offers.points.amount) : NaN;
        return { money, points: Number.isFinite(pointsAmount) && pointsAmount > 0 ? pointsAmount : null };
    }
    const money = course.money_price && Number.isFinite(Number(course.money_price.amountMinor))
        ? course.money_price
        : null;
    const points = Number(course.points_price);
    return { money, points: Number.isFinite(points) && points > 0 ? points : null };
}

export function isPremium(course) {
    return course?.access_model === "premium";
}

// Status is always shown with a text label; the tint only reinforces it.
export const ORDER_STATUS = {
    pending: { label: "Pending", variant: "warning" },
    completed: { label: "Completed", variant: "success" },
    failed: { label: "Failed", variant: "destructive" },
    cancelled: { label: "Cancelled", variant: "muted" },
    expired: { label: "Expired", variant: "muted" },
    refunded: { label: "Refunded", variant: "info" },
};

export const ORDER_METHOD = {
    points: "Points",
    gateway: "Card/Bank",
};

const ERROR_MESSAGES = {
    INSUFFICIENT_POINTS: "You do not have enough points for this course.",
    ALREADY_OWNED: "You already own this course.",
    COURSE_UNAVAILABLE: "This course is not available right now.",
    OFFER_UNAVAILABLE: "This offer has changed or is no longer available. Refresh the page to see the current price.",
    IDEMPOTENCY_CONFLICT: "This request conflicts with an earlier attempt. Please try again.",
    PAYMENTS_DISABLED: "Online payment is not available yet.",
    PROVIDER_UNAVAILABLE: "The payment provider is not responding. Please try again in a moment.",
    COURSE_ACCESS_REQUIRED: "You need to buy or redeem this course before you can start it.",
};

/** User-facing message for a failed commerce call, chosen by the server's error code. */
export function commerceErrorMessage(error, fallback = "Something went wrong. Please try again.") {
    const code = errorCode(error);
    if (code && ERROR_MESSAGES[code]) return ERROR_MESSAGES[code];
    if (error?.status === 429) return "Too many requests. Please wait a moment and try again.";
    return userMessage(error, fallback);
}

/** Only same-origin paths or http(s) provider URLs are followed. */
export function isSafeCheckoutUrl(url) {
    if (typeof url !== "string" || !url) return false;
    if (url.startsWith("/")) return !url.startsWith("//");
    try {
        const parsed = new URL(url);
        return parsed.protocol === "https:" || parsed.protocol === "http:";
    } catch {
        return false;
    }
}
