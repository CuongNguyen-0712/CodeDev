'use client'

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";

import { useApp } from "@/contexts/appContext";
import { getOpenConversation, setOpenConversation } from "@/lib/chat/openConversation";
import { retryTransient } from "@/lib/queryTimes";
import { useEditMessage, useRecallMessage, useReportMessage, useSendMessage, useToggleReaction } from "@/mutations/chat.mutation";
import { useTeamAction } from "@/mutations/team.mutation";
import { chatQueries } from "@/queries/chat.query";
import { teamQueries } from "@/queries/team.query";
import { useChatOutboxStore } from "@/stores/chatOutboxStore";

import { CHAT_HEIGHT } from "@/components/chat/chatHeight";
import Composer from "@/components/chat/composer";
import InviteFriendsDialog from "@/components/chat/inviteFriendsDialog";
import MessageList, { EmptyThread, useLeaveWhenGone } from "@/components/chat/messageList";
import { TEAM_SIZE } from "@/components/chat/newTeamDialog";
import RenameTeamDialog from "@/components/chat/renameTeamDialog";
import RequestBanner, { BlockDialog, failAlert } from "@/components/chat/requestBanner";
import TeamAvatar from "@/components/chat/teamAvatar";
import TeamMembersDialog from "@/components/chat/teamMembersDialog";
import UserAvatar from "@/components/chat/userAvatar";
import { ErrorReload } from "@/components/ui/error";

import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
    AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/shadcn/alert-dialog";
import { Badge } from "@/components/shadcn/badge";
import { Button } from "@/components/shadcn/button";
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/shadcn/dropdown-menu";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/shadcn/empty";
import { Skeleton } from "@/components/shadcn/skeleton";
import { Spinner } from "@/components/shadcn/spinner";

import { LuArrowLeft, LuBan, LuEllipsis, LuLogOut, LuPencil, LuUserPlus, LuUserRound, LuUsers } from "react-icons/lu";

// The pane fills the space below the navbar (CHAT_HEIGHT) and the thread scrolls inside it, keeping the composer in view.
// Phones: edge to edge with no border; the navbar's bottom line is the pane's top (a border here doubled it).
const PANE = `flex ${CHAT_HEIGHT} flex-col overflow-hidden rounded-lg border bg-card max-md:rounded-none max-md:border-0`;
const CANT_SEND = "You can't send messages in this conversation";

const nameOf = (user) => user?.nickname || user?.username || "Someone";
// The words the inbox uses for a message without text.
const previewOf = (m) => (m.body ? (m.body.includes("```") ? "[code]" : m.body.slice(0, 80)) : m.attachments?.some((a) => a.kind === "file") ? "[file]" : "[image]");

function ThreadHeader({ name, image, subtitle, team = false, children }) {
    return (
        <header className="flex items-center gap-3 border-b px-3 py-2.5">
            <Button asChild variant="ghost" size="icon-sm" className="md:hidden">
                <Link href="/messages" aria-label="Back to conversations"><LuArrowLeft aria-hidden="true" /></Link>
            </Button>
            {team ? <TeamAvatar /> : <UserAvatar name={name} image={image} />}
            <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-2">
                    <h2 className="truncate text-base font-semibold text-foreground">{name}</h2>
                    {team && <Badge variant="secondary" className="shrink-0">Team</Badge>}
                </div>
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

/** Confirms leaving; a host is told who takes over (the earliest joined member, spec rule 7) or that the team ends. */
function LeaveTeamDialog({ open, onOpenChange, name, teamId, members, isHost }) {
    const router = useRouter();
    const { showAlert } = useApp();
    const { leave } = useTeamAction();
    const busy = leave.isPending;
    const next = members?.find((m) => m.role === "member");
    const confirm = () => leave.mutateAsync(teamId).then(() => { showAlert(200, `You left ${name}`); router.replace("/messages"); }, failAlert(showAlert));

    return (
        <AlertDialog open={open} onOpenChange={(value) => !busy && onOpenChange(value)}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Leave {name}?</AlertDialogTitle>
                    <AlertDialogDescription>
                        {!isHost ? "You will stop receiving messages from this team." : next ? `${next.username} becomes the host.` : "The team will end."}
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
                    <AlertDialogAction variant="destructive" disabled={busy} onClick={confirm}>
                        {busy && <Spinner />}
                        Leave
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}

/** The team conversation's menu: Members and Leave for everyone; Invite friends and Rename team only for the host. */
function TeamMenu({ name, teamId, conversationId, meId, fallbackCount }) {
    const { status } = useSession();
    const members = useQuery(teamQueries.members(status, teamId)).data?.items;
    const [dialog, setDialog] = useState(null);   // "members" | "invite" | "rename" | "leave"
    const isHost = Boolean(members?.some((m) => m.role === "host" && m.id === meId));
    const count = members ? members.filter((m) => m.role !== "invited").length : fallbackCount;
    // Invitations hold places too (rule 2); only the host is sent them.
    const invited = members ? members.length - count : 0;
    const membersLabel = `Members (${count}/${TEAM_SIZE}${invited ? ` · ${invited} invited` : ""})`;
    const dialogProps = (key) => ({ open: dialog === key, onOpenChange: (open) => setDialog(open ? key : null), teamId });

    return (
        <>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button size="icon-sm" variant="ghost" className="text-muted-foreground data-[state=open]:bg-accent" aria-label={`More actions for ${name}`}>
                        <LuEllipsis />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuItem onSelect={() => setDialog("members")}><LuUsers />{membersLabel}</DropdownMenuItem>
                    {isHost && <DropdownMenuItem onSelect={() => setDialog("invite")}><LuUserPlus />Invite friends</DropdownMenuItem>}
                    {isHost && <DropdownMenuItem onSelect={() => setDialog("rename")}><LuPencil />Rename team</DropdownMenuItem>}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" onSelect={() => setDialog("leave")}><LuLogOut />Leave team</DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
            <TeamMembersDialog {...dialogProps("members")} title={membersLabel} />
            {isHost && <InviteFriendsDialog {...dialogProps("invite")} />}
            {isHost && <RenameTeamDialog {...dialogProps("rename")} currentName={name} conversationId={conversationId} />}
            <LeaveTeamDialog {...dialogProps("leave")} name={name} members={members} isHost={isHost} />
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
    const { toggle } = useToggleReaction(conversationId, meId);
    const [reply, setReply] = useState(null);   // { conversationId, id, senderName, preview }; ignored once the open conversation changes
    const [failures, setFailures] = useState({});   // clientId -> { message, retryable }

    const gone = useLeaveWhenGone(query.error);

    // Tells the realtime handlers which thread the viewer is looking at, so its new messages do not count as unread.
    useEffect(() => {
        const release = () => { if (getOpenConversation() === conversationId) setOpenConversation(null); };
        const sync = () => (document.visibilityState === "visible" ? setOpenConversation(conversationId) : release());
        sync();
        document.addEventListener("visibilitychange", sync);
        return () => { document.removeEventListener("visibilitychange", sync); release(); };
    }, [conversationId]);

    if (status === "loading" || query.isPending || gone) return <PaneSkeleton />;
    if (query.isError) return <ErrorReload data={query.error} refetch={() => query.refetch()} title="Could not load this conversation" />;

    const conversation = query.data;
    const replyTo = reply?.conversationId === conversationId ? reply : null;
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
    // The reply clears with the text, and comes back with it on a 422.
    const onSubmit = ({ body, attachmentIds, attachments }) => {
        const clientId = crypto.randomUUID();
        const quote = replyTo;
        setReply(null);
        const quoted = quote && { replyToId: quote.id, replyTo: { id: quote.id, senderName: quote.senderName, preview: quote.preview, deleted: false } };
        return deliver({ clientId, body, attachmentIds, attachments, ...quoted }).catch((error) => {
            if (error?.status !== 422) return;
            discard({ clientId });
            setReply((current) => current ?? quote);
            throw error;
        });
    };

    const handlers = {
        canReact: me?.state === "accepted",
        // A pending member can reply (sending accepts the request); only a member who can send gets Reply.
        onReply: conversation.canSend ? (m) => setReply({ conversationId, id: m.id, senderName: nameOf(m.sender), preview: previewOf(m) }) : undefined,
        onReact: (m, emoji) => toggle({ messageId: m.id, emoji }, { onError: fail }),
        onRetry: (m) => deliver({ clientId: m.clientId, body: m.body, attachmentIds: m.attachmentIds ?? [] }).catch(() => { }),
        onDiscard: discard,
        onEdit: (m, body) => edit.mutateAsync({ conversationId, messageId: m.id, body }).catch(fail),
        onUnsend: (m) => recall.mutateAsync({ conversationId, messageId: m.id }).catch(fail),
        onReport: (m, reason) => report.mutateAsync({ messageId: m.id, reason })
            .then(() => showAlert(200, "Thanks. Moderators will review this message."), fail),
    };

    return (
        <div className={PANE}>
            <ThreadHeader name={name} image={conversation.image} team={conversation.kind === "team"} subtitle={conversation.kind === "direct" ? undefined : `${conversation.members.length} ${conversation.members.length === 1 ? "member" : "members"}`}>
                {other && <HeaderMenu name={name} other={other} />}
                {conversation.kind === "team" && conversation.teamId && (
                    <TeamMenu name={name} teamId={conversation.teamId} conversationId={conversationId} meId={meId} fallbackCount={conversation.members.length} />
                )}
            </ThreadHeader>
            {me?.state === "pending" && (
                <div className="px-3 pt-3">
                    <RequestBanner conversationId={conversationId} name={name} otherId={other?.id} />
                </div>
            )}
            <MessageList conversation={conversation} meId={meId} failures={failures} {...handlers} />
            <div className="flex flex-col gap-1 px-3 pt-2 pb-3">
                {conversation.canSend
                    ? <Composer conversationId={conversationId} imagesAllowed={!isRequest} optimistic replyTo={replyTo} onCancelReply={() => setReply(null)} onSubmit={onSubmit} />
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
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4"><EmptyThread /></div>
            <div className="px-3 pt-2 pb-3">
                <Composer onSubmit={onSubmit} />
            </div>
        </div>
    );
}
