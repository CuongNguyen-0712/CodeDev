import { adminSearchDb } from "@/db/adminSearch.db";
import { actorCan } from "@/lib/authz";
import { SEARCH_MAX, SEARCH_MIN, SEARCH_TYPES } from "@/lib/adminSearch";
import { maskEmail } from "@/services/adminUser.service";

/**
 * Ctrl / Cmd + K search across users, courses, challenges, orders and runs. The route checked
 * admin.read; each group is searched and returned only when the actor holds its permission
 * (lib/adminSearch.js), so a course manager never sees users or orders.
 */
const SEARCHES = {
    user: async (actor, q) => {
        const pii = actorCan(actor, "user.pii");
        const rows = await adminSearchDb.users({ q, matchEmail: pii && q.includes("@") });
        return rows.map((row) => ({ id: row.id, label: row.username, detail: pii ? row.email : maskEmail(row.email) }));
    },
    course: async (actor, q) => (await adminSearchDb.courses({ q }))
        .map((row) => ({ id: row.id, label: row.title, detail: `${row.id} · ${row.publish_status}` })),
    challenge: async (actor, q) => (await adminSearchDb.challenges({ q }))
        .map((row) => ({ id: row.id, label: row.title, detail: row.course_title, courseId: row.course_id })),
    order: async (actor, q) => (await adminSearchDb.orders({ q }))
        .map((row) => ({ id: row.id, label: `${row.id} · ${row.username}`, detail: row.status })),
    run: async (actor, q) => (await adminSearchDb.runs({ q }))
        .map((row) => ({ id: row.id, label: row.id, detail: `${row.username} · ${row.challenge_title} · ${row.status}` })),
};

export const adminSearchService = {
    search: async ({ actor, q, type = null }) => {
        const term = String(q ?? "").trim().slice(0, SEARCH_MAX);
        if (term.length < SEARCH_MIN) return { q: term, groups: [] };
        const types = SEARCH_TYPES.filter((item) => (!type || item.type === type) && actorCan(actor, item.permission));
        const groups = await Promise.all(types.map(async (item) => ({ type: item.type, label: item.label, items: await SEARCHES[item.type](actor, term) })));
        return { q: term, groups: groups.filter((group) => group.items.length) };
    },
};
