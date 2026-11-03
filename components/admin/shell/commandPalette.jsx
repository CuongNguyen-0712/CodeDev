'use client';

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/shadcn/dialog";
import { ADMIN_FOOTER_NAV, ADMIN_NAV, SETTINGS_SECTIONS } from "@/lib/adminPermissions";
import { matches } from "@/components/admin/ui/listSearch";
import { cn } from "@/lib/utils";

import { LuArrowRight, LuSearch, LuUser } from "react-icons/lu";

/** Every place the admin can open, filtered by the permissions this admin holds. */
function destinations(granted) {
    const screens = [...ADMIN_NAV, ...ADMIN_FOOTER_NAV].filter((item) => granted.has(item.permission));
    const settings = granted.has("settings.read")
        ? SETTINGS_SECTIONS.map((section) => ({ key: `settings-${section.key}`, href: `/admin/settings/${section.key}`, label: `Settings: ${section.label}` }))
        : [];
    return [...screens.map((item) => ({ key: item.key, href: item.href, label: item.label })), ...settings];
}

/**
 * Ctrl / Cmd + K: jump to any admin screen, or search users by what was typed. Arrow keys move, Enter
 * opens, Escape closes. Built on the dialog the admin already uses, so no new dependency.
 */
export default function CommandPalette({ permissions, open, onOpenChange }) {
    const router = useRouter();
    const [query, setQuery] = useState("");
    const [index, setIndex] = useState(0);
    const granted = useMemo(() => new Set(permissions), [permissions]);
    const all = useMemo(() => destinations(granted), [granted]);

    const items = useMemo(() => {
        const found = all.filter((item) => matches(query, item.label, item.key));
        const term = query.trim();
        if (term && granted.has("user.read")) {
            found.push({ key: "find-user", href: `/admin/users?q=${encodeURIComponent(term)}`, label: `Find user “${term}”`, user: true });
        }
        return found;
    }, [all, granted, query]);

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
        if (event.key === "ArrowDown") { event.preventDefault(); setIndex((current) => Math.min(items.length - 1, current + 1)); }
        if (event.key === "ArrowUp") { event.preventDefault(); setIndex((current) => Math.max(0, current - 1)); }
        if (event.key === "Enter") { event.preventDefault(); go(items[index]); }
    };

    const activeId = items[index] ? `palette-${items[index].key}` : undefined;

    return (
        <Dialog open={open} onOpenChange={close}>
            <DialogContent showCloseButton={false} className="top-[20%] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-lg">
                <DialogTitle className="sr-only">Go to</DialogTitle>
                <DialogDescription className="sr-only">Type a screen name, or a username to find a user.</DialogDescription>
                <div className="flex items-center gap-2 border-b border-border px-3">
                    <LuSearch aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                    <input
                        autoFocus
                        value={query}
                        onChange={(event) => { setQuery(event.target.value); setIndex(0); }}
                        onKeyDown={onKeyDown}
                        placeholder="Go to a screen or find a user"
                        aria-label="Go to a screen or find a user"
                        role="combobox"
                        aria-expanded="true"
                        aria-controls="palette-list"
                        aria-activedescendant={activeId}
                        className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                    />
                </div>
                <ul id="palette-list" role="listbox" aria-label="Destinations" className="max-h-80 overflow-y-auto p-1.5">
                    {items.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted-foreground">Nothing matches “{query.trim()}”.</li>}
                    {items.map((item, itemIndex) => {
                        const Icon = item.user ? LuUser : LuArrowRight;
                        return (
                            <li
                                key={item.key}
                                id={`palette-${item.key}`}
                                role="option"
                                aria-selected={itemIndex === index}
                                onMouseMove={() => setIndex(itemIndex)}
                                onClick={() => go(item)}
                                className={cn(
                                    "flex cursor-pointer items-center gap-2.5 rounded-md px-3 py-2 text-sm",
                                    itemIndex === index ? "bg-accent text-accent-foreground" : "text-foreground",
                                )}
                            >
                                <Icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                                <span className="truncate">{item.label}</span>
                            </li>
                        );
                    })}
                </ul>
            </DialogContent>
        </Dialog>
    );
}
