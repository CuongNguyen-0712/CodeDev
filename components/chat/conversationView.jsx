'use client'

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";

import { useApp } from "@/contexts/appContext";
import { retryTransient } from "@/lib/queryTimes";
import { useEditMessage, useRecallMessage, useReportMessage, useSendMessage } from "@/mutations/chat.mutation";
import { chatQueries } from "@/queries/chat.query";
import { useChatOutboxStore } from "@/stores/chatOutboxStore";

import Composer from "@/components/chat/composer";
import MessageList, { EmptyThread, useLeaveWhenGone } from "@/components/chat/messageList";
import RequestBanner, { BlockDialog, failAlert } from "@/components/chat/requestBanner";
import UserAvatar from "@/components/chat/userAvatar";
import { ErrorReload } from "@/components/ui/error";

import { Button } from "@/components/shadcn/button";
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/shadcn/dropdown-menu";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/shadcn/empty";
import { Skeleton } from "@/components/shadcn/skeleton";

import { LuArrowLeft, LuBan, LuEllipsis, LuUserRound, LuUsers } from "react-icons/lu";

// The layout grid only sets a min height, so the pane is sized to the viewport (navbar h-12 + the
// layout's padding) and the thread scrolls inside it, keeping the composer in view.
const PANE = "flex h-[calc(100svh-3rem-6rem)] min-h-96 flex-col overflow-hidden rounded-lg border bg-card";
const CANT_SEND = "You can't send messages in this conversation";

function ThreadHeader({ name, image, subtitle, children }) {
    return (
        <header className="flex items-center gap-3 border-b px-3 py-2.5">
            <Button asChild variant="ghost" size="icon-sm" className="md:hidden">
                <Link href="/messages" aria-label="Back to conversations"><LuArrowLeft aria-hidden="true" /></Link>
            </Button>
            <UserAvatar name={name} image={image} />
            <div className="min-w-0 flex-1">
                <h2 className="truncate text-base font-semibold text-foreground">{name}</h2>
                {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
            </div>
            {children}
        </header>
    );
}

function PaneSkeleton() {
    return (
        <div className={PANE} aria-busy="true">
            <div className="flex items-center gap-3 border-b px-3 py-2.5">
                <Skeleton className="size-9 rounded-full" />
                <Skeleton className="h-4 w-40" />
            </div>
        </div>
    );
}

function HeaderMenu({ name, other }) {
    const [blocking, setBlocking] = useState(false);
    return (
        <>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button size="icon-sm" variant="ghost" className="text-muted-foreground data-[state=open]:bg-accent" aria-label={`More actions for ${name}`}>
                        <LuEllipsis />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuItem asChild>
                        <Link href={`/profile/${other.id}`}><LuUserRound />View profile</Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" onSelect={() => setBlocking(true)}><LuBan />Block</DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
            <BlockDialog open={blocking} onOpenChange={setBlocking} name={name} userId={other.id} />
        </>
    );
}

const CantSend = () => <p className="rounded-lg border bg-muted/50 px-4 py-3 text-sm text-muted-foreground">{CANT_SEND}</p>;

/** The open conversation: header, request banner, thread, typing line and composer. */
export default function ConversationView({ conversationId }) {
    const router = useRouter();
    const { showAlert } = useApp();
    const fail = failAlert(showAlert);
    const { data: session, status } = useSession();
    const meId = session?.user?.id;
    const query = useQuery({ ...chatQueries.conversation(conversationId), enabled: status === "authenticated", retry: retryTransient });
    const send = useSendMessage(conversationId);
    const edit = useEditMessage();
    const recall = useRecallMessage();
    const report = useReportMessage();
    const [failures, setFailures] = useState({});   // clientId -> { message, retryable }

    const gone = useLeaveWhenGone(query.error);

    if (status === "loading" || query.isPending || gone) return <PaneSkeleton />;
    if (query.isError) return <ErrorReload data={query.error} refetch={() => query.refetch()} title="Could not load this conversation" />;

    const conversation = query.data;
    const name = conversation.title || "Conversation";
    const me = conversation.members.find((m) => m.id === meId);
    const other = conversation.kind === "direct" ? conversation.members.find((m) => m.id !== meId) : null;
    // A pending member means a request: no images until it is accepted (server rule).
    const isRequest = conversation.members.some((m) => m.state === "pending");
    const sender = me ? { id: me.id, username: me.username, nickname: me.nickname, image: me.image } : { id: meId };

    const deliver = (input) => send.mutateAsync({ ...input, sender }).then(
        () => setFailures(({ [input.clientId]: _done, ...rest }) => rest),
        (error) => {
            // 403: refused for good, so no Retry. 404: the conversation is gone for this member.
            setFailures((f) => ({ ...f, [input.clientId]: { retryable: error?.status !== 403, message: error?.status === 403 ? CANT_SEND : undefined } }));
            if (error?.status === 404) { fail(error); router.replace("/messages"); }
            throw error;
        },
    );

    const discard = ({ clientId }) => {
        useChatOutboxStore.getState().removeUnsent(conversationId, clientId);
        setFailures(({ [clientId]: _gone, ...rest }) => rest);
    };

    // Resolves once the send settles; rejects only on 422 so the composer gets its text back (spec section 10).
    const onSubmit = ({ body, attachmentIds, attachments }) => {
        const clientId = crypto.randomUUID();
        return deliver({ clientId, body, attachmentIds, attachments }).catch((error) => {
            if (error?.status !== 422) return;
            discard({ clientId });
            throw error;
        });
    };

    const handlers = {
        onRetry: (m) => deliver({ clientId: m.clientId, body: m.body, attachmentIds: m.attachmentIds ?? [] }).catch(() => { }),
        onDiscard: discard,
        onEdit: (m, body) => edit.mutateAsync({ conversationId, messageId: m.id, body }).catch(fail),
        onUnsend: (m) => recall.mutateAsync({ conversationId, messageId: m.id }).catch(fail),
        onReport: (m, reason) => report.mutateAsync({ messageId: m.id, reason })
            .then(() => showAlert(200, "Thanks. Moderators will review this message."), fail),
    };

    return (
        <div className={PANE}>
            <ThreadHeader name={name} image={conversation.image} subtitle={conversation.kind === "direct" ? undefined : `${conversation.members.length} members`}>
                {other && <HeaderMenu name={name} other={other} />}
            </ThreadHeader>
            {me?.state === "pending" && (
                <div className="px-3 pt-3">
                    <RequestBanner conversationId={conversationId} name={name} otherId={other?.id} />
                </div>
            )}
            <MessageList conversation={conversation} meId={meId} failures={failures} {...handlers} />
            <div className="flex flex-col gap-1 border-t px-3 pt-3 pb-3">
                {conversation.canSend
                    ? <Composer conversationId={conversationId} imagesAllowed={!isRequest} optimistic onSubmit={onSubmit} />
                    : <CantSend />}
            </div>
        </div>
    );
}

/**
 * /messages/new?to=: an empty thread with `recipient` (public profile fields). The first send goes by
 * toUserId; the server reuses the direct conversation if one exists, so either way it opens the result.
 */
export function NewConversationView({ recipient }) {
    const router = useRouter();
    const send = useSendMessage(undefined);
    const attempt = useRef(null);   // { body, clientId }: a resend of the same text keeps its clientId

    if (!recipient) {
        return (
            <Empty className="h-full border border-dashed">
                <EmptyHeader>
                    <EmptyMedia variant="icon"><LuUsers aria-hidden="true" /></EmptyMedia>
                    <EmptyTitle>Choose someone to message</EmptyTitle>
                    <EmptyDescription>Open a learner&apos;s profile and choose Message.</EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                    <Button asChild variant="outline" size="sm"><Link href="/contact">Find people</Link></Button>
                </EmptyContent>
            </Empty>
        );
    }

    const name = recipient.nickname || recipient.username;
    const onSubmit = async ({ body }) => {
        if (attempt.current?.body !== body) attempt.current = { body, clientId: crypto.randomUUID() };
        const { conversation } = await send.mutateAsync({ clientId: attempt.current.clientId, body, toUserId: recipient.id });
        router.replace(`/messages/${conversation.id}`);
    };

    return (
        <div className={PANE}>
            <ThreadHeader name={name} image={recipient.image} subtitle={`@${recipient.username}`} />
            <div className="flex min-h-0 flex-1 flex-col p-4"><EmptyThread /></div>
            <div className="border-t p-3">
                <Composer onSubmit={onSubmit} />
            </div>
        </div>
    );
}
