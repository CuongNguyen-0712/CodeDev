import { ApiError } from "@/lib/error/apiError";

export function nextStatus({ current, submit, trusted, appealing, appealedAt }) {
    if (!current || current === "draft" || current === "rejected") {
        return { status: submit ? (trusted ? "published" : "pending") : "draft", appeal: false };
    }
    if (current === "pending") {
        if (appealedAt) throw new ApiError("This post is under review", 409);
        return { status: "pending", appeal: false };
    }
    if (current === "published") return { status: "published", appeal: false };
    if (current === "hidden" && appealing && !appealedAt) return { status: "pending", appeal: true };
    throw new ApiError(appealedAt ? "This post was hidden and its appeal was already used" : "This post was hidden; you can appeal once", 403);
}
