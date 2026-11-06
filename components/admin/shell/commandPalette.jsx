'use client';

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/shadcn/dialog";
import { ADMIN_FOOTER_NAV, ADMIN_NAV, SETTINGS_SECTIONS } from "@/lib/adminPermissions";
import { SEARCH_MIN, SEARCH_TYPES, parseScope } from "@/lib/adminSearch";
import { adminQueries } from "@/queries/premium.query";
import { matches } from "@/components/admin/ui/listSearch";
import { cn } from "@/lib/utils";

import { LuArrowRight, LuBookOpen, LuCode, LuPlay, LuReceipt, LuSearch, LuUser } from "react-icons/lu";

/** Every place the admin can open, filtered by the permissions this admin holds. */
function destinations(granted) {
    const screens = [...ADMIN_NAV, ...ADMIN_FOOTER_NAV].filter((item) => [].concat(item.permission).some((code) => granted.has(code)));
    const settings = granted.has("platform.settings")
        ? SETTINGS_SECTIONS.map((section) => ({ key: `settings-${section.key}`, href: `/admin/settings/${section.key}`, label: `Settings: ${section.label}` }))
        : [];
    return [...screens.map((item) => ({ key: item.key, href: item.href, label: item.label })), ...settings];
}

// Where a search result opens: its detail page, or its list page when it has none.
const RESULT = {
    user: { icon: LuUser, href: (item) => `/admin/users/${encodeURIComponent(item.id)}` },
    course: { icon: LuBookOpen, href: (item) => `/admin/courses/${encodeURIComponent(item.id)}` },
    // A challenge is edited in its course's Challenges tab.
    challenge: { icon: LuCode, href: (item) => `/admin/courses/${encodeURIComponent(item.courseId)}` },
    order: { icon: LuReceipt, href: (item) => `/admin/orders?q=${encodeURIComponent(item.id)}` },
    run: { icon: LuPlay, href: (item) => `/admin/runs/${encodeURIComponent(item.id)}` },
};

function Option({ item, active, onHover, onPick }) {
    const Icon = item.icon;
    return (
        <li
            id={`palette-${item.key}`}
            role="option"
            aria-selected={active}
            onMouseMove={onHover}
            onClick={onPick}
            className={cn(
                "flex cursor-pointer items-center gap-2.5 rounded-md px-3 py-2 text-sm",
                active ? "bg-accent text-accent-foreground" : "text-foreground",
            )}
        >
            <Icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
            {item.detail && <span className="max-w-[45%] shrink-0 truncate text-xs text-muted-foreground">{item.detail}</span>}
        </li>
    );
}

/**
 * Ctrl / Cmd + K: jump to any admin screen, or find a user, course, challenge, order or run
 * (GET /api/admin/search, groups limited to the admin's permissions). "user:", "course:", ... limit
 * the search to one kind. Arrow keys move, Enter opens, Escape closes.
 */
export default function CommandPalette({ permissions, open, onOpenChange }) {
    const router = useRouter();
    const [query, setQuery] = useState("");
    const [index, setIndex] = useState(0);
    const inputRef = useRef(null);
    const granted = useMemo(() => new Set(permissions), [permissions]);
    const all = useMemo(() => destinations(granted), [granted]);
    const scopes = useMemo(() => SEARCH_TYPES.filter((item) => granted.has(item.permission)), [granted]);

    const scope = parseScope(query);
    const [debounced, setDebounced] = useState(scope);
    useEffect(() => {
        const timer = setTimeout(() => setDebounced(scope), 250);
        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- debounce on the parsed text only
    }, [scope.q, scope.type]);

    const searching = debounced.q.length >= SEARCH_MIN;
    const search = useQuery({ ...adminQueries.search(debounced.q, debounced.type), enabled: open && searching });
    const groups = searching ? search.data?.groups : undefined;

    const screens = useMemo(
        () => (scope.type ? [] : all.filter((item) => matches(scope.q, item.label, item.key)).map((item) => ({ ...item, icon: LuArrowRight }))),
        [all, scope.q, scope.type],
    );
    const sections = useMemo(() => {
        const found = (groups || []).map((group) => ({
            key: group.type,
            label: group.label,
            items: group.items.map((item) => ({ ...item, key: `${group.type}-${item.id}`, href: RESULT[group.type].href(item), icon: RESULT[group.type].icon })),
        }));
        const list = screens.length ? [{ key: "screens", label: "Screens", items: screens }, ...found] : found;
        let position = 0;
        return list.map((section) => ({ ...section, items: section.items.map((item) => ({ ...item, position: position++ })) }));
    }, [groups, screens]);
    const items = sections.flatMap((section) => section.items);
    const current = Math.min(index, Math.max(0, items.length - 1));

    useEffect(() => {
        const onKey = (event) => {
            if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
                event.preventDefault();
                onOpenChange(!open);
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, onOpenChange]);

    const close = (value) => {
        onOpenChange(value);
        if (!value) { setQuery(""); setIndex(0); }
    };

    const go = (item) => {
        if (!item) return;
        close(false);
        router.push(item.href);
    };

    const onKeyDown = (event) => {
        if (event.key === "ArrowDown") { event.preventDefault(); setIndex(Math.min(items.length - 1, current + 1)); }
        if (event.key === "ArrowUp") { event.preventDefault(); setIndex(Math.max(0, current - 1)); }
        if (event.key === "Enter") { event.preventDefault(); go(items[current]); }
    };

    const activeId = items[current] ? `palette-${items[current].key}` : undefined;
    const pending = searching && (search.isFetching || debounced.q !== scope.q || debounced.type !== scope.type);
    const status = scope.type && scope.q.length < SEARCH_MIN
        ? `Type at least ${SEARCH_MIN} characters to search ${SEARCH_TYPES.find((item) => item.type === scope.type).label.toLowerCase()}.`
        : pending ? "Searching…"
        : search.isError && searching ? "Search failed. Keep typing to try again."
        : items.length === 0 ? `Nothing matches “${scope.q}”.`
        : "";

    return (
        <Dialog open={open} onOpenChange={close}>
            <DialogContent showCloseButton={false} className="top-[20%] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-lg">
                <DialogTitle className="sr-only">Go to or search</DialogTitle>
                <DialogDescription className="sr-only">
                    Type a screen name, or a user, course, challenge, order or run. Start with user:, course:, challenge:, order: or run: to search one kind.
                </DialogDescription>
                <div className="flex items-center gap-2 border-b border-border px-3">
                    <LuSearch aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                    <input
                        ref={inputRef}
                        autoFocus
                        value={query}
                        onChange={(event) => { setQuery(event.target.value); setIndex(0); }}
                        onKeyDown={onKeyDown}
                        placeholder="Go to a screen or search"
                        aria-label="Go to a screen or search"
                        role="combobox"
                        aria-expanded="true"
                        aria-controls="palette-list"
                        aria-activedescendant={activeId}
                        aria-autocomplete="list"
                        maxLength={120}
                        className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                    />
                </div>
                {!scope.type && scopes.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 border-b border-border px-3 py-2">
                        <span className="text-xs text-muted-foreground">Search in</span>
                        {scopes.map((item) => (
                            <button
                                key={item.type}
                                type="button"
                                onClick={() => { setQuery(`${item.type}: ${scope.q}`); setIndex(0); inputRef.current?.focus(); }}
                                className="rounded-md border border-border px-1.5 py-0.5 font-mono text-xs text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                            >
                                {item.type}:
                            </button>
                        ))}
                    </div>
                )}
                <ul id="palette-list" role="listbox" aria-label="Destinations and results" className="max-h-80 overflow-y-auto p-1.5">
                    {sections.map((section) => (
                        <li key={section.key} role="group" aria-labelledby={`palette-group-${section.key}`} className="pb-1">
                            <div id={`palette-group-${section.key}`} role="presentation" className="px-3 pt-2 pb-1 text-xs text-muted-foreground">{section.label}</div>
                            <ul role="presentation">
                                {section.items.map((item) => (
                                    <Option key={item.key} item={item} active={item.position === current} onHover={() => setIndex(item.position)} onPick={() => go(item)} />
                                ))}
                            </ul>
                        </li>
                    ))}
                </ul>
                <p aria-live="polite" className={cn("px-3 text-center text-sm text-muted-foreground", status ? "pb-6" : "sr-only")}>{status}</p>
            </DialogContent>
        </Dialog>
    );
}
