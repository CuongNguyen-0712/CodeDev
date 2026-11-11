import { notFound } from "next/navigation";

import { NewConversationView } from "@/components/chat/conversationView";

import { profileService } from "@/services/profile.service";

export const metadata = { title: "New message | CodeDev", robots: { index: false, follow: false } };

// Reads the recipient's public profile per request (privacy settings apply at once).
export const instant = false;

// ?to=<publicId>. A missing or hidden profile answers 404, like /profile/[id]; no `to` asks to pick someone.
export default async function Page({ searchParams }) {
    const { to } = await searchParams;
    if (typeof to !== "string" || !to) return <NewConversationView recipient={null} />;
    const profile = await profileService.getPublicProfile(to);
    if (!profile) notFound();
    return <NewConversationView recipient={{ id: profile.id, username: profile.username, nickname: profile.nickname, image: profile.image }} />;
}
