'use client'

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useInfiniteQuery } from "@tanstack/react-query";

import { friendQueries } from "@/queries/friend.query";

import UserAvatar from "@/components/chat/userAvatar";
import { PeopleEmpty, PersonList } from "@/components/contact/personRow";

import { Button } from "@/components/shadcn/button";
import { Checkbox } from "@/components/shadcn/checkbox";

import { LuUsers } from "react-icons/lu";

/**
 * The caller's friends as a checkbox list; `value` is the picked ids, at most `max` (the rest turn disabled at the cap).
 * `exclude` ids (people already in the team or invited) are left out of the list.
 */
export default function FriendPicker({ value, onChange, max, exclude = [], disabled = false }) {
    const { status } = useSession();
    const hidden = new Set(exclude);
    const query = useInfiniteQuery({
        ...friendQueries.list(status, ''),
        select: (data) => ({ ...data, pages: data.pages.map((page) => ({ ...page, items: (page?.items || []).filter((f) => !hidden.has(f.id)) })) }),
    });
    const full = value.length >= max;
    const toggle = (id, on) => onChange(on ? [...value, id] : value.filter((picked) => picked !== id));

    return (
        <div className="flex flex-col gap-2">
            <div className="max-h-64 overflow-y-auto">
                <PersonList
                    query={query}
                    noun="friends"
                    errorTitle="Could not load your friends"
                    empty={(
                        <PeopleEmpty icon={LuUsers} title="No friends to add" description="Teams are made of friends. Add friends on Contact first.">
                            <Button asChild variant="outline" size="sm"><Link href="/contact">Find people</Link></Button>
                        </PeopleEmpty>
                    )}
                    renderRow={(friend) => {
                        const checked = value.includes(friend.id);
                        return (
                            <li key={friend.id}>
                                <label className="flex items-center gap-3 px-4 py-3 text-sm">
                                    <Checkbox
                                        checked={checked}
                                        disabled={disabled || (!checked && full)}
                                        onCheckedChange={(on) => toggle(friend.id, on === true)}
                                    />
                                    <UserAvatar name={friend.username} image={friend.image} />
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate font-medium text-foreground">{friend.username}</span>
                                        <span className="block truncate text-xs text-muted-foreground">
                                            {friend.nickname && friend.nickname !== 'None' ? friend.nickname : 'No nickname'}
                                        </span>
                                    </span>
                                </label>
                            </li>
                        );
                    }}
                />
            </div>
            <p className="text-xs text-muted-foreground tabular-nums" aria-live="polite">{value.length}/{max} selected</p>
        </div>
    );
}
