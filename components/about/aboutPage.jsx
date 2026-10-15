"use client";

import Link from "next/link";

import { Button } from "@/components/shadcn/button";

import {
    LuArrowRight,
    LuCode,
    LuLibrary,
    LuMap,
    LuUsers,
} from "react-icons/lu";

const PRINCIPLES = [
    {
        title: "Practice over watching",
        description: "Reading about a loop is not the same as writing one. Lessons are paired with challenges you solve yourself, with tests that tell you right away whether your code works.",
    },
    {
        title: "Always a clear next step",
        description: "Courses are ordered lesson by lesson and roadmaps suggest an order across topics, so you spend less time deciding what to study and more time studying it.",
    },
    {
        title: "Learning is easier with other people",
        description: "You can find other learners, keep them as contacts and form study teams to work through material together.",
    },
];

const AREAS = [
    {
        icon: LuLibrary,
        title: "Courses",
        description: "The catalog of courses, filterable by level.",
        href: "/course",
    },
    {
        icon: LuCode,
        title: "Learning",
        description: "Your enrolled courses and progress. Requires an account.",
        href: "/learning",
    },
    {
        icon: LuMap,
        title: "Roadmap",
        description: "Suggested learning order across topics.",
        href: "/roadmap",
    },
    {
        icon: LuUsers,
        title: "Contacts",
        description: "People you learn with. Requires an account.",
        href: "/contact",
    },
];

export default function AboutPage() {
    return (
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-4 pt-6 pb-10 sm:px-6 lg:gap-16 lg:pt-10">
            <header className="flex max-w-3xl flex-col gap-4">
                <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl lg:text-5xl">
                    About CodeDev
                </h1>
                <p className="max-w-[62ch] text-base leading-relaxed text-pretty text-muted-foreground sm:text-lg">
                    CodeDev is a place to learn programming by doing it. Every course combines short written
                    lessons with coding challenges and quizzes, and keeps track of where you are so you can
                    come back to it.
                </p>
            </header>

            <section aria-labelledby="why-title" className="grid gap-8 lg:grid-cols-12 lg:gap-10">
                <div className="flex flex-col gap-4 lg:col-span-7">
                    <h2 id="why-title" className="text-2xl font-semibold tracking-tight">
                        Why we built it
                    </h2>
                    <div className="flex max-w-[65ch] flex-col gap-4 text-sm leading-relaxed text-muted-foreground sm:text-base">
                        <p>
                            Most people who learn to program get stuck in the same place: they can follow along
                            with an example, but freeze when facing an empty editor. The fix is practice with fast
                            feedback, and that is what CodeDev is organised around.
                        </p>
                        <p>
                            Challenges run in your browser, so there is nothing to install. You can run the sample
                            tests as often as you like while you work, and when you submit, your code is also checked
                            against hidden tests so you know it handles more than the obvious cases.
                        </p>
                    </div>
                </div>

                <aside aria-labelledby="areas-title" className="flex flex-col gap-3 lg:col-span-5">
                    <h2 id="areas-title" className="text-sm font-medium text-muted-foreground">
                        Where to find things
                    </h2>
                    <ul className="flex list-none flex-col divide-y rounded-lg border">
                        {AREAS.map(({ icon: Icon, title, description, href }) => (
                            <li key={href}>
                                <Link
                                    href={href}
                                    className="group flex items-center gap-3 rounded-lg px-4 py-3 outline-none transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 active:bg-accent/80"
                                >
                                    <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-foreground">
                                        <Icon className="size-4" aria-hidden="true" />
                                    </span>
                                    <span className="flex min-w-0 flex-1 flex-col">
                                        <span className="text-sm font-medium text-foreground">{title}</span>
                                        <span className="text-sm text-muted-foreground">{description}</span>
                                    </span>
                                    <LuArrowRight
                                        className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                                        aria-hidden="true"
                                    />
                                </Link>
                            </li>
                        ))}
                    </ul>
                </aside>
            </section>

            <section aria-labelledby="principles-title" className="flex flex-col gap-6">
                <h2 id="principles-title" className="text-2xl font-semibold tracking-tight">
                    What guides the product
                </h2>
                <ol className="flex list-none flex-col divide-y border-y">
                    {PRINCIPLES.map((principle, index) => (
                        <li key={principle.title} className="grid gap-2 py-5 sm:grid-cols-[3rem_minmax(0,16rem)_minmax(0,1fr)] sm:gap-6">
                            <span aria-hidden="true" className="tabular font-mono text-sm text-muted-foreground">
                                {String(index + 1).padStart(2, "0")}
                            </span>
                            <h3 className="text-base font-semibold text-foreground">{principle.title}</h3>
                            <p className="max-w-[62ch] text-sm leading-relaxed text-muted-foreground">
                                {principle.description}
                            </p>
                        </li>
                    ))}
                </ol>
            </section>

            <section
                aria-labelledby="about-cta-title"
                className="flex flex-col gap-5 rounded-lg border bg-muted/40 p-6 sm:p-8 md:flex-row md:items-center md:justify-between"
            >
                <div className="flex flex-col gap-2">
                    <h2 id="about-cta-title" className="text-xl font-semibold tracking-tight">
                        Try a course
                    </h2>
                    <p className="max-w-[52ch] text-sm leading-relaxed text-muted-foreground">
                        Browse the catalog without an account, or create one to enroll and save your progress.
                    </p>
                </div>
                <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
                    <Button asChild>
                        <Link href="/course">
                            <LuLibrary />
                            Browse courses
                        </Link>
                    </Button>
                    <Button asChild variant="outline">
                        <Link href="/auth">Create an account</Link>
                    </Button>
                </div>
            </section>
        </div>
    );
}
