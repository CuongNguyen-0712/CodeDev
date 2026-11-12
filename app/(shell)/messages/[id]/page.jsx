import { cache } from "react";
import { notFound } from "next/navigation";

import ConversationView from "@/components/chat/conversationView";

import { getAuthSession } from "@/lib/session";
import { chatService } from "@/services/chat.service";

// Membership decides the answer, so it renders per request.
export const instant = false;

// One lookup per request, shared by generateMetadata and the page. `undefined`: no fresh session here
// (an expired access token is refreshed by the client), so the client view decides; `null`: not the viewer's.
const loadConversation = cache(async (conversationId) => {
    const session = await getAuthSession({ soft: true });
    if (!session?.user?.id) return undefined;
    try {
        return await chatService.getConversation({ userId: session.user.id, conversationId });
    } catch (error) {
        if (error?.status === 400 || error?.status === 404) return null;
        throw error;
    }
});

export async function generateMetadata({ params }) {
    const { id } = await params;
    const conversation = await loadConversation(id);
    return {
        title: conversation === null ? "Page not found | CodeDev" : `${conversation?.title || "Messages"} | CodeDev`,
        robots: { index: false, follow: false },
    };
}

// Missing, left and hidden conversations all answer the same 404.
export default async function Page({ params }) {
    const { id } = await params;
    if ((await loadConversation(id)) === null) notFound();
    return <ConversationView conversationId={id} />;
}
