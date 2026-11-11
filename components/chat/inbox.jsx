'use client'

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";

import { chatQueries } from "@/queries/chat.query";

import { ErrorReload } from "@/components/ui/error";
import { ConversationRow, ConversationSkeleton } from "@/components/chat/conversationRow";

import { Button } from "@/components/shadcn/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/shadcn/empty";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/shadcn/input-group";
import { Tabs, TabsList, TabsTrigger } from "@/components/shadcn/tabs";

import { LuInbox, LuLoaderCircle, LuMessageSquare, LuSearch } from "react-icons/lu";

const TABS = ['all', 'requests'];

function LoadMore({ hasNextPage, isFetchingNextPage, fetchNextPage, isError }) {
    if (isError) {
        return (
            <div className="flex justify-center py-3 text-sm text-muted-foreground" role="alert">
                <span className="flex items-center gap-2">
                    Could not load more conversations.
                    <Button variant="link" size="xs" onClick={() => fetchNextPage()}>Try again</Button>
                </span>
            </div>
        );
    }
    if (!hasNextPage) return null;
    return (
        <div className="flex justify-center py-3">
            <Button type="button" variant="outline" size="sm" onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
                {isFetchingNextPage && <LuLoaderCircle className="animate-spin" aria-hidden="true" />}
                {isFetchingNextPage ? 'Loading...' : 'Load more'}
            </Button>
        </div>
    );
}

function InboxList({ tab, filter, activeId }) {
    const { status } = useSession();
    const query = useInfiniteQuery({ ...chatQueries.inbox(tab), enabled: status === 'authenticated' });
    const items = query.data?.pages?.flatMap((page) => page?.items || []) ?? [];
    const isLoading = query.isLoading || status === 'loading';
    const needle = filter.trim().toLowerCase();
    const shown = needle ? items.filter((item) => (item.title || '').toLowerCase().includes(needle)) : items;

    if (!isLoading && query.isError && items.length === 0) {
        return <ErrorReload data={query.error} refetch={() => query.refetch()} title="Could not load your conversations" />;
    }

    const loadMore = (
        <LoadMore
            hasNextPage={query.hasNextPage}
            isFetchingNextPage={query.isFetchingNextPage}
            fetchNextPage={query.fetchNextPage}
            isError={query.isError && items.length > 0}
        />
    );

    if (!isLoading && shown.length === 0) {
        const Icon = tab === 'requests' ? LuInbox : LuMessageSquare;
        const title = needle ? "No matching conversations" : tab === 'requests' ? "No message requests" : "No conversations yet";
        const description = needle
            ? "Try a different name, or load more conversations."
            : tab === 'requests'
                ? "When someone you don't know messages you, it shows up here first."
                : "Start a conversation from someone's profile.";
        return (
            <div className="flex flex-col">
                <Empty className="border border-dashed">
                    <EmptyHeader>
                        <EmptyMedia variant="icon"><Icon aria-hidden="true" /></EmptyMedia>
                        <EmptyTitle>{title}</EmptyTitle>
                        <EmptyDescription>{description}</EmptyDescription>
                    </EmptyHeader>
                </Empty>
                {needle && loadMore}
            </div>
        );
    }

    return (
        <div className="flex flex-col">
            <div className="divide-y overflow-hidden rounded-lg border" aria-busy={isLoading}>
                {isLoading
                    ? <ConversationSkeleton />
                    : shown.map((item) => <ConversationRow key={item.id} item={item} active={item.id === activeId} />)}
            </div>
            {loadMore}
        </div>
    );
}

export default function Inbox({ activeId }) {
    const { status } = useSession();
    const searchParams = useSearchParams();
    const requested = searchParams?.get('tab');
    const [tab, setTab] = useState(TABS.includes(requested) ? requested : 'all');
    const [filter, setFilter] = useState('');
    const requests = useQuery({ ...chatQueries.unread(), enabled: status === 'authenticated' }).data?.requests ?? 0;

    return (
        <div className="flex min-w-0 flex-col gap-4">
            <InputGroup>
                <InputGroupAddon aria-hidden="true"><LuSearch /></InputGroupAddon>
                <InputGroupInput
                    type="search"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    placeholder="Filter conversations"
                    aria-label="Filter conversations"
                    autoComplete="off"
                />
            </InputGroup>
            <Tabs value={tab} onValueChange={setTab}>
                <TabsList>
                    <TabsTrigger value="all"><LuMessageSquare aria-hidden="true" />All</TabsTrigger>
                    <TabsTrigger value="requests">
                        <LuInbox aria-hidden="true" />Requests
                        {requests > 0 && <span className="text-muted-foreground tabular">{requests}</span>}
                    </TabsTrigger>
                </TabsList>
            </Tabs>
            <InboxList key={tab} tab={tab} filter={filter} activeId={activeId} />
        </div>
    );
}
