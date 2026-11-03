import { cache } from "react";
import { notFound } from "next/navigation";

import PublicProfilePage from "@/components/profile/publicProfilePage";

import { profileService } from "@/services/profile.service";

// Next may hand the segment over still percent-encoded (usernames can contain spaces / accents).
const decodeKey = (value) => {
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
};

// One lookup per request, shared by generateMetadata and the page.
const loadProfile = cache((key) => profileService.getPublicProfile(key));

// Public profiles follow privacy settings at once, so they render per request (not cached).
export const instant = false;

export async function generateMetadata({ params }) {
    const { id } = await params;
    const profile = await loadProfile(decodeKey(id));
    return {
        title: profile ? `${profile.nickname || profile.username} | CodeDev` : "Page not found | CodeDev",
        description: profile ? `${profile.username} on CodeDev: level, ranks and learning progress.` : undefined,
        // Not indexed while public profiles are new (plan §3.2).
        robots: { index: false, follow: false },
    };
}

// Missing, hidden and locked accounts all answer the same 404.
export default async function Page({ params }) {
    const { id } = await params;
    const profile = await loadProfile(decodeKey(id));
    if (!profile) notFound();

    return (
        <PublicProfilePage profile={{ ...profile, memberSince: profile.memberSince ? new Date(profile.memberSince).toISOString() : null }} />
    );
}
