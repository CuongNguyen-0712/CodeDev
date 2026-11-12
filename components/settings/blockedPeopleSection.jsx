'use client';

import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";

import { useApp } from "@/contexts/appContext";
import { chatQueries } from "@/queries/chat.query";
import { useUnblockUser } from "@/mutations/chat.mutation";

import UserAvatar from "@/components/chat/userAvatar";
import { ErrorReload } from "@/components/ui/error";
import { Button } from "@/components/shadcn/button";
import { Skeleton } from "@/components/shadcn/skeleton";

// The mutation invalidates the blocks query, so an unblocked row leaves the list on the refetch.
export default function BlockedPeopleSection() {
    const { status } = useSession();
    const { showAlert: alert } = useApp();
    const { data, isLoading, isError, error, refetch } = useQuery(chatQueries.blocks(status));
    const unblock = useUnblockUser();

    if (isLoading) {
        return (
            <div className="space-y-4 p-4" role="status" aria-busy="true" aria-label="Loading blocked people">
                {[0, 1].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
        );
    }
    if (isError) return <div className="p-4"><ErrorReload data={error} refetch={refetch} compact /></div>;

    const items = data?.items || [];
    if (items.length === 0) {
        return <p className="px-4 py-3.5 text-sm text-muted-foreground">You haven&apos;t blocked anyone.</p>;
    }

    return (
        <ul className="m-0 list-none divide-y p-0">
            {items.map((person) => {
                const name = person.username;
                return (
                    <li key={person.id} className="flex items-center justify-between gap-4 px-4 py-3.5">
                        <div className="flex min-w-0 items-center gap-3">
                            <UserAvatar name={name} image={person.image} />
                            <div className="min-w-0">
                                <p className="m-0 truncate text-sm font-medium text-foreground">{name}</p>
                                {person.nickname ? <p className="m-0 truncate text-xs text-muted-foreground">{person.nickname}</p> : null}
                            </div>
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            aria-label={`Unblock ${name}`}
                            disabled={unblock.isPending}
                            onClick={() => unblock.mutate(person.id, {
                                onError: (err) => alert(err?.status || 500, err?.message || "Could not unblock this person"),
                            })}
                        >
                            Unblock
                        </Button>
                    </li>
                );
            })}
        </ul>
    );
}
