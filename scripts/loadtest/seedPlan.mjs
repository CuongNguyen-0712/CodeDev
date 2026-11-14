// Deterministic plan of the synthetic load users (no database, no Math.random).
const mulberry32 = (seed) => () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

export const PER_USER = { courses: 3, exp: 20, points: 10, friends: 5, pending: 2, chats: 3, messages: 20 };

export function seedPlan({ users, courseIds, seed = 1 }) {
    if (courseIds.length < PER_USER.courses) throw new Error(`need at least ${PER_USER.courses} courses, got ${courseIds.length}`);
    const rnd = mulberry32(seed);
    const int = (min, max) => min + Math.floor(rnd() * (max - min + 1));
    const out = [];
    for (let index = 1; index <= users; index++) {
        const tag = String(index).padStart(5, "0");
        const pool = [...courseIds];
        const courses = [];
        while (courses.length < PER_USER.courses) courses.push(pool.splice(int(0, pool.length - 1), 1)[0]);
        // Only the lower index creates the edge, so a pair appears once. Late users have fewer higher indexes to pick from.
        const others = new Set();
        const want = Math.min(PER_USER.friends + PER_USER.pending, users - index);
        while (others.size < want) others.add(int(index + 1, users));
        const picked = [...others];
        const friends = picked.slice(0, PER_USER.friends);
        out.push({
            index,
            username: `lt_${tag}`,
            email: `lt_${tag}@loadtest.codedev.test`,
            courses,
            expEntries: Array.from({ length: PER_USER.exp }, () => int(5, 50)),
            pointEntries: Array.from({ length: PER_USER.points }, () => int(10, 100)),
            friends,
            pending: picked.slice(PER_USER.friends),
            chats: friends.slice(0, PER_USER.chats),
        });
    }
    return { users: out };
}
