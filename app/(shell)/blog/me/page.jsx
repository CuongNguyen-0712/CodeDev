import Link from "next/link";
import { redirect } from "next/navigation";

import MyPosts from "@/components/blog/myPosts";
import { Button } from "@/components/shadcn/button";
import { getAuthSession } from "@/lib/session";

import { LuNewspaper, LuPenLine } from "react-icons/lu";

export const metadata = { title: "My posts | CodeDev", robots: { index: false } };

// Signed-in only, decided per request.
export const instant = false;

export default async function Page() {
    const session = await getAuthSession({ soft: true });
    if (!session?.user?.id) redirect("/auth");

    return (
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 pt-6 pb-10 sm:px-6 lg:pt-10 *:w-full *:max-w-3xl">
            <header className="flex flex-wrap items-center justify-between gap-4">
                <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">My posts</h1>
                <div className="flex flex-wrap gap-2">
                    <Button asChild variant="outline">
                        <Link href="/blog"><LuNewspaper aria-hidden="true" />Blog</Link>
                    </Button>
                    <Button asChild>
                        <Link href="/blog/new"><LuPenLine aria-hidden="true" />Write a post</Link>
                    </Button>
                </div>
            </header>
            <MyPosts />
        </div>
    );
}
