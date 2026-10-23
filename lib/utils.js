import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs) {
    return twMerge(clsx(inputs));
}

/** "chris@gmail.com" -> "c***@gmail.com" (shown where the full address should not be). */
export function maskEmail(email) {
    const [local = "", domain = ""] = String(email || "").split("@");
    return domain ? `${local.slice(0, 1)}***@${domain}` : "";
}
