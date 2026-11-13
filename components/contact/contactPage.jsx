'use client';

import { useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";

import { userQueries } from "@/queries/user.query";
import { friendQueries } from "@/queries/friend.query";
import SearchBar from "../ui/searchBar";
import FriendButton from "./friendButton";
import FriendsTab from "./friendsTab";
import InvitationsTab from "./invitationsTab";
import { PeopleEmpty, PersonList, PersonRow } from "./personRow";

import { Button } from "@/components/shadcn/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/shadcn/tabs";

import { LuUserPlus, LuUsers, LuUserSearch, LuX } from "react-icons/lu";

const TABS = ['find', 'friends', 'invitations'];

function FindPeople() {
    const { status } = useSession();
    const [search, setSearch] = useState('');
    const query = useInfiniteQuery(userQueries.users(status, search));

    const people = query.data?.pages?.flatMap((page) => page?.items || []) || [];
    const hasQuery = search.trim().length > 0;
    const isInitialLoading = (status === 'loading' || query.isLoading) && people.length === 0;
    const countLabel = `${people.length}${query.hasNextPage ? '+' : ''} ${people.length === 1 ? 'person' : 'people'}`;
    const listLabel = isInitialLoading
        ? 'Loading people...'
        : `${countLabel}${hasQuery ? ` matching "${search.trim()}"` : ''}`;

    return (
        <>
            <section className="w-full" aria-label="Search people">
                <SearchBar
                    placeholder="Search by username..."
                    search={search}
                    setSearch={setSearch}
                    pending={query.isLoading}
                    isFilter={false}
                />
            </section>

            <section aria-labelledby="contacts-list-heading" className="flex flex-col gap-3">
                <h2 id="contacts-list-heading" className="flex min-h-8 items-center gap-2 text-sm font-medium text-foreground">
                    <LuUsers className="size-4 text-muted-foreground" aria-hidden="true" />
                    <span aria-live="polite">{listLabel}</span>
                </h2>

                <PersonList
                    query={query}
                    noun="people"
                    errorTitle="Could not load learners"
                    empty={hasQuery ? (
                        <PeopleEmpty icon={LuUserSearch} title="No one matches this username" description="Check the spelling or try a shorter part of the username.">
                            <Button variant="outline" size="sm" onClick={() => setSearch('')}>Clear search</Button>
                        </PeopleEmpty>
                    ) : (
                        <PeopleEmpty icon={LuUserSearch} title="No other learners yet" description="New learners will appear here as they join." />
                    )}
                    renderRow={(item, index) => {
                        const name = item.username || item.name || 'Unknown user';
                        return (
                            <PersonRow
                                key={item.id}
                                item={item}
                                name={name}
                                meta={item.nickname && item.nickname !== 'None' ? item.nickname : 'No nickname'}
                                index={index}
                                actions={<FriendButton user={item} friendship={item.friendship ?? null} />}
                            />
                        );
                    }}
                />
            </section>
        </>
    );
}

export default function Contact({ state, setState }) {
    const { status } = useSession();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const requested = searchParams?.get('tab');
    const tab = TABS.includes(requested) ? requested : 'find';
    const { data: counts } = useQuery(friendQueries.counts(status));
    const isVisible = state !== false;

    // The tab lives in the URL (reloads and notification links land on it). The native history call updates
    // useSearchParams without a server round trip, which router.replace would make to re-run the page's prefetch.
    const setTab = (next) => {
        const params = new URLSearchParams(searchParams);
        params.set('tab', next);
        window.history.replaceState(null, '', `${pathname}?${params.toString()}`);
    };

    const count = (n) => (n > 0 ? <span className="text-muted-foreground tabular">{n}</span> : null);

    return (
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 pt-6 pb-10 sm:px-6 lg:pt-10">
            <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div className="space-y-2">
                    <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                        Contacts
                    </h1>
                    <p className="max-w-[60ch] text-sm text-muted-foreground">
                        Find other CodeDev learners, add them as friends and answer the requests you receive.
                    </p>
                </div>
                {typeof setState === 'function' && (
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="self-start sm:self-auto"
                        onClick={() => setState(false)}
                        aria-label="Close contacts"
                    >
                        <LuX />
                    </Button>
                )}
            </header>

            <Tabs value={tab} onValueChange={setTab}>
                <TabsList>
                    <TabsTrigger value="find"><LuUserSearch aria-hidden="true" />Find people</TabsTrigger>
                    <TabsTrigger value="friends"><LuUsers aria-hidden="true" />Friends{count(counts?.friends)}</TabsTrigger>
                    <TabsTrigger value="invitations"><LuUserPlus aria-hidden="true" />Invitations{count(counts?.received)}</TabsTrigger>
                </TabsList>
            </Tabs>

            {/* Only the open tab is mounted, so only it fetches. */}
            {isVisible && (tab === 'friends' ? <FriendsTab /> : tab === 'invitations' ? <InvitationsTab /> : <FindPeople />)}
        </div>
    );
}
