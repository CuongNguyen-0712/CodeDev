// Harness: a tiny hooks simulator (shared, identical, by lessons 4 and 5 of typescript-react-frontend).
// It runs the learner's hook - useCatalogResults (lesson 4) or useCatalogAutoRefresh (lesson 5) - as
//   hook(props, { useState, useEffect, useMemo, useCallback, useRef }, api)
// and re-renders it the way React does, without React:
//   - useState: the setter takes a value or an updater; Object.is(next, current) skips the render.
//   - useEffect: runs after the render that scheduled it; deps compared item by item with Object.is,
//     no deps array = after every render; cleanups run before the effect runs again and on unmount.
//   - useMemo / useCallback / useRef as in React.
//   - more than 50 renders in one step = a render loop: rendering stops and the output says loop: true.
// api.fetchCourses(query) records the query and returns a Promise of { items: string[] (course ids), total }
// from a fixed fake catalog; responses are delivered only when the harness settles them (in call order,
// or newest first). api.setInterval / api.clearInterval run on a fake clock that only "advance" moves.
//
// input: { props, steps }   props = the first props; steps run in order after the mount:
//   { props: {...} }        the parent renders again with these values merged into the previous props
//                           (always a NEW props object; { props: {} } = a re-render with equal values);
//                           pending responses are then delivered in call order, unless "hold": true
//   { settle: "newestFirst" | "inOrder" }  deliver the held responses
//   { advance: ms }         move the fake clock; each interval that fires is followed by its responses
//   { unmount: true }       run every effect cleanup; later state updates are ignored
// Output: { loop, fetchCount, queries, shown, activeTimers } (+ error when the hook threw)
//   queries      every fetchCourses call as "search=..&level=..&sort=..&page=.."
//   shown        what the hook returned in its last render
//   activeTimers intervals that were never cleared
async function __harness(input) {
    const hook = typeof useCatalogResults === "function" ? useCatalogResults : useCatalogAutoRefresh;
    const RENDER_CAP = 50;
    const PAGE_SIZE = 2;
    const CATALOG = [
        { id: "web-http-fundamentals", title: "Web Application Fundamentals", level: "beginner", learners: 5400 },
        { id: "typescript-foundations", title: "TypeScript Foundations", level: "beginner", learners: 4700 },
        { id: "sql-data-modeling", title: "SQL & Data Modeling", level: "beginner", learners: 3900 },
        { id: "typescript-react-frontend", title: "React + TypeScript Architecture", level: "intermediate", learners: 2100 },
        { id: "nextjs-rendering-caching", title: "Next.js Rendering & Caching", level: "intermediate", learners: 1800 },
        { id: "react-testing-patterns", title: "Testing React Apps", level: "intermediate", learners: 1200 },
        { id: "software-architecture-fundamentals", title: "Software Architecture Fundamentals", level: "advanced", learners: 900 },
        { id: "web-performance-deep-dive", title: "Web Performance Deep Dive", level: "advanced", learners: 650 },
    ];
    const keyOf = (q) => `search=${q.search ?? ""}&level=${q.level ?? "all"}&sort=${q.sort ?? "popular"}&page=${q.page ?? 1}`;
    // fake GET /api/courses: filter by level and title, sort "title" A-Z, anything else by learners
    const answer = (q) => {
        const search = String(q.search ?? "").toLowerCase();
        const level = q.level ?? "all";
        const page = q.page ?? 1;
        const list = CATALOG.filter((c) => (level === "all" || c.level === level) && c.title.toLowerCase().includes(search))
            .sort(q.sort === "title" ? (a, b) => (a.title < b.title ? -1 : 1) : (a, b) => b.learners - a.learners);
        return { items: list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((c) => c.id), total: list.length };
    };

    const queries = [];
    let pending = [];
    let now = 0;
    let nextTimerId = 1;
    const timers = new Map();
    const slots = [];
    let cursor = 0;
    let queued = [];
    let props = { ...input.props };
    let shown = null;
    let renders = 0;
    let mounted = false;
    let flushing = false;
    let dirty = false;
    let loop = false;
    let error = null;

    const fail = (e) => { if (!error) error = String((e && e.message) || e); mounted = false; };
    const sameDeps = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));

    const hooks = {
        useState(initial) {
            const i = cursor++;
            if (!slots[i]) {
                const s = { value: typeof initial === "function" ? initial() : initial };
                s.set = (next) => {
                    if (!mounted) return; // updates after unmount are ignored
                    const value = typeof next === "function" ? next(s.value) : next;
                    if (Object.is(value, s.value)) return; // same value: no render
                    s.value = value;
                    dirty = true;
                    flush();
                };
                slots[i] = s;
            }
            return [slots[i].value, slots[i].set];
        },
        useEffect(effect, deps) {
            const i = cursor++;
            const s = slots[i] || (slots[i] = { deps: null, cleanup: null, ran: false });
            if (!s.ran || deps === undefined || !sameDeps(s.deps, deps)) queued.push({ s, effect, deps });
        },
        useMemo(compute, deps) {
            const i = cursor++;
            if (!slots[i] || deps === undefined || !sameDeps(slots[i].deps, deps)) slots[i] = { value: compute(), deps };
            return slots[i].value;
        },
        useCallback(fn, deps) {
            return hooks.useMemo(() => fn, deps);
        },
        useRef(initial) {
            const i = cursor++;
            return slots[i] || (slots[i] = { current: initial });
        },
    };

    const api = {
        fetchCourses(query) {
            const q = query || {};
            queries.push(keyOf(q));
            const response = answer(q);
            return new Promise((resolve) => pending.push(() => resolve(response)));
        },
        setInterval(fn, ms) {
            const id = nextTimerId++;
            const every = Math.max(1, Number(ms) || 1);
            timers.set(id, { fn, every, at: now + every });
            return id;
        },
        clearInterval(id) {
            timers.delete(id);
        },
    };

    // render, commit, run effects; repeat while state changed (setState inside an effect or during render)
    function flush() {
        if (flushing) return; // the loop below picks the update up
        flushing = true;
        try {
            while (dirty && mounted && !loop) {
                dirty = false;
                if (++renders > RENDER_CAP) { loop = true; break; }
                cursor = 0;
                queued = [];
                shown = hook(props, hooks, api);
                const effects = queued;
                for (const { s } of effects) if (s.cleanup) { const c = s.cleanup; s.cleanup = null; c(); }
                for (const e of effects) {
                    e.s.ran = true;
                    e.s.deps = e.deps;
                    const c = e.effect();
                    e.s.cleanup = typeof c === "function" ? c : null;
                }
            }
        } catch (e) {
            fail(e);
        } finally {
            flushing = false;
        }
    }

    const microtasks = async () => { for (let k = 0; k < 20; k++) await null; };
    async function settle(newestFirst) {
        for (let round = 0; pending.length && !loop; round++) {
            if (round >= 200) { loop = true; break; }
            const batch = pending;
            pending = [];
            if (newestFirst) batch.reverse();
            for (const deliver of batch) { deliver(); await microtasks(); }
        }
    }
    async function advance(ms) {
        const end = now + ms;
        for (let fired = 0; fired < 1000 && !loop; fired++) {
            let next = null;
            for (const t of timers.values()) if (t.at <= end && (!next || t.at < next.at)) next = t;
            if (!next) break;
            now = next.at;
            next.at += next.every;
            try { next.fn(); } catch (e) { fail(e); }
            await settle(false);
        }
        now = end;
    }

    try {
        mounted = true;
        dirty = true;
        flush();
        await settle(false);
        for (const step of input.steps || []) {
            if (loop || error) break;
            renders = 0;
            if (step.props) {
                if (mounted) { props = { ...props, ...step.props }; dirty = true; flush(); }
                if (!step.hold) await settle(false);
            } else if (step.settle) {
                await settle(step.settle === "newestFirst");
            } else if (step.advance) {
                await advance(step.advance);
            } else if (step.unmount) {
                mounted = false;
                for (const s of slots) if (s && s.cleanup) { const c = s.cleanup; s.cleanup = null; c(); }
                await settle(false);
            }
        }
    } catch (e) {
        fail(e);
    }

    // only the first 20 queries are listed (a loop would print hundreds); fetchCount is the real total
    const out = { loop, fetchCount: queries.length, queries: queries.slice(0, 20), shown: shown === undefined ? null : shown, activeTimers: timers.size };
    if (error) out.error = error;
    return JSON.parse(JSON.stringify(out));
}
