import { notFound, redirect } from "next/navigation";

import { NewConversationView } from "@/components/chat/conversationView";

import { getAuthSession } from "@/lib/session";
import { chatService } from "@/services/chat.service";
import { profileService } from "@/services/profile.service";

export const metadata = { title: "New message | CodeDev", robots: { index: false, follow: false } };

// Reads the recipient's public profile and the viewer's conversations per request.
export const instant = false;

/** The viewer's open direct conversation with `toUserId`, or null. 404 (declined, hidden) is null, so a decliner can still write back. */
async function openConversationId(userId, toUserId) {
    const id = await chatService.findDirectConversationId({ userId, toUserId });
    if (!id) return null;
    try {
        await chatService.getConversation({ userId, conversationId: id });
        return id;
    } catch (error) {
        if (error?.status === 404) return null;
        throw error;
    }
}

// ?to=<publicId>. A missing or hidden profile answers 404, like /profile/[id]; no `to` asks to pick someone.
export default async function Page({ searchParams }) {
    const { to } = await searchParams;
    if (typeof to !== "string" || !to) return <NewConversationView recipient={null} />;
    const profile = await profileService.getPublicProfile(to);
    if (!profile) notFound();

    // Without a fresh session (expired access token) the first send still lands in the existing conversation.
    const session = await getAuthSession({ soft: true });
    const existing = session?.user?.id ? await openConversationId(session.user.id, profile.id) : null;
    if (existing) redirect(`/messages/${existing}`);

    return <NewConversationView recipient={{ id: profile.id, username: profile.username, nickname: profile.nickname, image: profile.image }} />;
}
