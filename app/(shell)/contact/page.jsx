import { Suspense } from "react";
import { HydrationBoundary, QueryClient, dehydrate } from "@tanstack/react-query";
import { PageSkeleton } from "@/components/ui/loading";

import ContactPage from "@/components/contact/contactPage";

import { socialService } from "@/services/social.service";
import { friendQueries } from "@/queries/friend.query";
import { userQueries } from "@/queries/user.query";
import { getAuthSession } from "@/lib/session";

export const metadata = {
    title: "Contacts | CodeDev",
    description: "Find other CodeDev learners, add them as friends and answer friend requests.",
};

// The first page of each list, as the client asks for it (same limit as its route).
const FIRST_PAGES = {
    find: (userId) => [[userQueries.users("", ""), socialService.searchUsers({ userId, search: "", limit: 10 })]],
    friends: (userId) => [[friendQueries.list("", ""), socialService.listFriends({ userId })]],
    invitations: (userId) => ["received", "sent"].map((direction) =>
        [friendQueries.invitations("", direction), socialService.listInvitations({ userId, direction })]),
};

// The open tab's first page and the tab counts are rendered on the server (per viewer, so inside the
// Suspense); React Query then takes over under the same keys. A failed prefetch is only logged: the client fetches again.
async function ContactPrefetch({ searchParams }) {
    const { tab } = await searchParams;
    const session = await getAuthSession({ soft: true });
    const userId = session?.user?.id;
    const queryClient = new QueryClient();

    if (userId) {
        const lists = FIRST_PAGES[Object.hasOwn(FIRST_PAGES, tab) ? tab : "find"](userId);
        await Promise.all([
            ...lists.map(([query, load]) => load.then(
                (page) => queryClient.setQueryData(query.queryKey, { pages: [page], pageParams: [null] }),
                (error) => console.error("Failed to prefetch the contact list:", error),
            )),
            socialService.counts({ userId }).then(
                (counts) => queryClient.setQueryData(friendQueries.counts("").queryKey, counts),
                (error) => console.error("Failed to prefetch the friend counts:", error),
            ),
        ]);
    }

    return (
        <HydrationBoundary state={dehydrate(queryClient)}>
            <ContactPage />
        </HydrationBoundary>
    );
}

export default function Page({ searchParams }) {
    return (
        <Suspense fallback={<PageSkeleton />}>
            <ContactPrefetch searchParams={searchParams} />
        </Suspense>
    )
}
