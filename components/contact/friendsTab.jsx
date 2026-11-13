'use client';

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useInfiniteQuery } from "@tanstack/react-query";

import { friendQueries } from "@/queries/friend.query";
import { useFriendAction } from "@/mutations/friend.mutation";
import { useApp } from "@/contexts/appContext";
import { failAlert } from "@/components/chat/requestBanner";
import SearchBar from "@/components/ui/searchBar";
import { PeopleEmpty, PersonList, PersonRow, personName } from "./personRow";

import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
    AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/shadcn/alert-dialog";
import { Button } from "@/components/shadcn/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/shadcn/dropdown-menu";
import { Spinner } from "@/components/shadcn/spinner";

import { LuEllipsis, LuUserMinus, LuUsers } from "react-icons/lu";

function FriendMenu({ user, name }) {
    const { showAlert } = useApp();
    const { remove } = useFriendAction();
    const [confirming, setConfirming] = useState(false);
    const busy = remove.isPending;

    // mutateAsync: the optimistic change removes this row before the answer comes back.
    const unfriend = () => remove.mutateAsync(user.id).then(
        () => showAlert(200, `${name} is no longer your friend`),
        failAlert(showAlert),
    );

    return (
        <>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button size="icon-sm" variant="ghost" className="text-muted-foreground data-[state=open]:bg-accent" aria-label={`More actions for ${name}`}>
                        <LuEllipsis />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuItem variant="destructive" onSelect={() => setConfirming(true)}><LuUserMinus />Unfriend</DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
            <AlertDialog open={confirming} onOpenChange={(next) => !busy && setConfirming(next)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Unfriend {name}?</AlertDialogTitle>
                        <AlertDialogDescription>
                            {name} leaves your friends list. Your conversation stays, and either of you can send a new request.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
                        <AlertDialogAction variant="destructive" disabled={busy} onClick={unfriend}>
                            {busy && <Spinner />}
                            Unfriend
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}

/**
 * Friends tab: search by name (server side) and an infinite list; each row has Message and a menu with Unfriend.
 * shortcut: rows are not virtualised (pages of 20); virtualise if someone has more than ~1,000 friends.
 */
export default function FriendsTab() {
    const { status } = useSession();
    const [search, setSearch] = useState('');
    const query = useInfiniteQuery(friendQueries.list(status, search));
    const hasQuery = search.trim().length > 0;

    return (
        <section aria-label="Friends" className="flex flex-col gap-3">
            <SearchBar placeholder="Search your friends..." search={search} setSearch={setSearch} pending={query.isLoading} isFilter={false} />
            <PersonList
                query={query}
                noun="friends"
                errorTitle="Could not load your friends"
                empty={hasQuery ? (
                    <PeopleEmpty icon={LuUsers} title="No friends match this name" description="Check the spelling or try a shorter part of the name.">
                        <Button variant="outline" size="sm" onClick={() => setSearch('')}>Clear search</Button>
                    </PeopleEmpty>
                ) : (
                    <PeopleEmpty icon={LuUsers} title="No friends yet" description="Send a friend request from Find people. Once it is accepted, they show up here." />
                )}
                renderRow={(item, index) => {
                    const name = personName(item);
                    return (
                        <PersonRow key={item.id} item={item} name={name} meta={`@${item.username}`} index={index}
                            actions={<FriendMenu user={item} name={name} />} />
                    );
                }}
            />
        </section>
    );
}
