import { redirect } from "next/navigation";

import PostEditor from "@/components/blog/postEditor";
import { getAuthSession } from "@/lib/session";

export const metadata = { title: "Edit post | CodeDev", robots: { index: false } };

// Signed-in only, decided per request.
export const instant = false;

export default async function Page({ params }) {
    const { id } = await params;
    const session = await getAuthSession({ soft: true });
    if (!session?.user?.id) redirect("/auth");

    return (
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 pt-6 pb-10 sm:px-6 lg:pt-10 *:w-full *:max-w-3xl">
            <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">Edit post</h1>
            <PostEditor id={id} />
        </div>
    );
}
