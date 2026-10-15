"use client";

import Link from "next/link";

import { Button } from "@/components/shadcn/button";
import {
    Empty,
    EmptyContent,
    EmptyDescription,
    EmptyHeader,
    EmptyMedia,
    EmptyTitle,
} from "@/components/shadcn/empty";

import { LuLibrary, LuNewspaper } from "react-icons/lu";

export default function Blog() {
    return (
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 pt-6 pb-10 sm:px-6 lg:pt-10">
            <header className="flex flex-col gap-2">
                <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                    Blog
                </h1>
                <p className="max-w-[60ch] text-sm text-muted-foreground">
                    Articles about programming, learning to code and updates to CodeDev.
                </p>
            </header>

            <Empty className="border">
                <EmptyHeader>
                    <EmptyMedia variant="icon">
                        <LuNewspaper aria-hidden="true" />
                    </EmptyMedia>
                    <EmptyTitle>
                        <h2 className="text-lg font-medium tracking-tight">No articles yet</h2>
                    </EmptyTitle>
                    <EmptyDescription>
                        The first posts are being written. In the meantime, the courses are the best place to start learning.
                    </EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                    <Button asChild>
                        <Link href="/course">
                            <LuLibrary />
                            Browse courses
                        </Link>
                    </Button>
                </EmptyContent>
            </Empty>
        </div>
    );
}
