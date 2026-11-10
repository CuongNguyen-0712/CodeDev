import {
    LuAward, LuBell, LuCircleAlert, LuCircleCheck, LuCoins, LuEyeOff, LuLockOpen, LuMegaphone, LuMessageSquare, LuShieldCheck, LuTrophy,
} from "react-icons/lu";

/**
 * Inbox kinds written by services/notification.service.js and services/announcement.service.js,
 * with the icon and its colour (plain, on the row: no tinted tile) in the bell and /notifications.
 * `team` marks rows an admin sent or caused: they carry a "CodeDev team" label.
 */
export const NOTIFICATION_KINDS = {
    access_granted: { icon: LuLockOpen, className: "text-success" },
    access_revoked: { icon: LuCircleAlert, className: "text-warning" },
    level_up: { icon: LuTrophy, className: "text-xp" },
    reward: { icon: LuCoins, className: "text-xp" },
    achievement: { icon: LuAward, className: "text-primary-ink" },
    course_completed: { icon: LuCircleCheck, className: "text-info" },
    announcement: { icon: LuMegaphone, className: "text-primary-ink", team: true },
    feedback_handled: { icon: LuMessageSquare, className: "text-info", team: true },
    content_hidden: { icon: LuEyeOff, className: "text-warning", team: true },
    balance_adjusted: { icon: LuCoins, className: "text-warning", team: true },
    role_granted: { icon: LuShieldCheck, className: "text-primary-ink", team: true },
};

export const NOTIFICATION_FALLBACK = { icon: LuBell, className: "text-muted-foreground" };

export const notificationKind = (kind) => NOTIFICATION_KINDS[kind] || NOTIFICATION_FALLBACK;
