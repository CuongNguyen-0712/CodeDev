import { ApiError } from "@/lib/error/apiError";

/** `value` when it is a public id of that kind (cnv|msg|att), else ApiError 400. */
export function chatId(kind, value) {
    if (!new RegExp(`^${kind}_[0-9a-z]{26}$`).test(value ?? "")) throw new ApiError("Invalid id", 400);
    return value;
}

const MAX_SEQ = 9223372036854775807n;

/** `before` query value: null (newest page) or a bigint-range seq string, else ApiError 400. */
export function seqParam(value) {
    if (value == null || value === "") return null;
    if (!/^\d{1,19}$/.test(value) || BigInt(value) > MAX_SEQ) throw new ApiError("Invalid before", 400);
    return value;
}
