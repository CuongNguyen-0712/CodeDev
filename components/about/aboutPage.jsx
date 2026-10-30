"use client";

import Link from "next/link";

import { CourseShelf } from "@/components/index";
import { Button } from "@/components/shadcn/button";

import {
    LuArrowRight,
    LuCode,
    LuLibrary,
    LuMap,
    LuTrophy,
} from "react-icons/lu";

const PRINCIPLES = [
    {
        title: "Practice over watching",
        description: "Reading about a loop is not the same as writing one. Almost every lesson ends in a challenge or a quiz, and its tests tell you right away whether your code works.",
    },
    {
        title: "Always a clear next step",
        description: "A few questions when you join pick a first course for your role and level. Courses run lesson by lesson, and roadmaps put whole courses in order, so you spend your time studying rather than choosing.",
    },
    {
        title: "Help that does not hand you the answer",
        description: "Hints get more specific one at a time, so you can get unstuck without being shown the whole solution. EXP, levels and achievements follow the work you actually do.",
    },
];

const AREAS = [
    {
        icon: LuLibrary,
        title: "Courses",
        description: "The full catalog, filterable by level, language, role and price.",
        href: "/course",
    },
    {
        icon: LuMap,
        title: "Roadmaps",
        description: "Courses in order for frontend, backend, DevOps, data and more.",
        href: "/roadmap",
    },
    {
        icon: LuCode,
        title: "My learning",
        description: "Your enrolled courses and where you stopped. Requires an account.",
        href: "/learning",
    },
    {
        icon: LuTrophy,
        title: "Leaderboard",
        description: "Where your EXP puts you among other learners. Requires an account.",
        href: "/ranking",
    },
];

/** The catalog in one sentence, from live figures; null without them. */
function catalogSentence(stats) {
    if (!stats?.courses) return null;
    const n = (value) => Number(value || 0).toLocaleString("en-US");
    const free = stats.free_courses ? ` (${n(stats.free_courses)} of them free)` : "";
    const work = [
        stats.lessons && `${n(stats.lessons)} lessons`,
        stats.coding_challenges && `${n(stats.coding_challenges)} coding challenges`,
        stats.quizzes && `${n(stats.quizzes)} quizzes`,
    ].filter(Boolean);
    const languages = stats.languages ? ` across ${n(stats.languages)} languages` : "";
    const roadmaps = stats.roadmaps ? `, ordered into ${n(stats.roadmaps)} role roadmaps` : "";
    return `Today the catalog holds ${n(stats.courses)} courses${free} with ${work.join(", ")}${languages}${roadmaps}.`;
}

export default function AboutPage({ stats = null }) {
    const catalog = catalogSentence(stats);

    return (
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-14 px-4 pt-6 pb-12 sm:px-6 lg:gap-20 lg:pt-10">
            <header className="flex max-w-3xl flex-col gap-4">
                <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl lg:text-5xl">
                    About CodeDev
                </h1>
                <p className="max-w-[60ch] text-lg leading-relaxed text-pretty text-foreground">
                    CodeDev teaches programming by having you write it. Each course is a run of short written
                    lessons, and almost every lesson ends in a challenge or a quiz that checks your work.
                </p>
            </header>

            <section aria-labelledby="why-title" className="grid gap-10 lg:grid-cols-12">
                <div className="flex flex-col gap-4 lg:col-span-7">
                    <h2 id="why-title" className="text-2xl font-semibold tracking-tight">
                        Why we built it
                    </h2>
                    <div className="flex max-w-[65ch] flex-col gap-4 text-base leading-relaxed text-foreground">
                        <p>
                            Most people who learn to program get stuck in the same place: they can follow along
                            with an example, but freeze in front of an empty editor. The fix is practice with fast
                            feedback, and CodeDev is organised around it.
                        </p>
                        <p>
                            You write code in the browser and it runs in an isolated sandbox on our side, so there
                            is nothing to install. Run the sample tests as often as you like; when you submit, hidden
                            tests check that your code handles more than the obvious cases.
                        </p>
                        {catalog && <p>{catalog}</p>}
                    </div>
                </div>

                <aside aria-labelledby="areas-title" className="flex flex-col gap-3 lg:col-span-5">
                    <h2 id="areas-title" className="text-base font-semibold text-foreground">
                        Where to find things
                    </h2>
                    {/* A tone step, not an outlined box: the rows separate by space and their own hover. */}
                    <ul className="flex list-none flex-col gap-1 rounded-lg bg-canvas p-1.5">
                        {AREAS.map(({ icon: Icon, title, description, href }) => (
                            <li key={href}>
                                <Link
                                    href={href}
                                    className="group flex items-center gap-3 rounded-md px-3 py-3 outline-none transition-colors hover:bg-background focus-visible:ring-[3px] focus-visible:ring-ring/50 active:bg-background/80"
                                >
                                    <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-background text-foreground">
                                        <Icon className="size-4" aria-hidden="true" />
                                    </span>
                                    <span className="flex min-w-0 flex-1 flex-col">
                                        <span className="text-sm font-semibold text-foreground">{title}</span>
                                        <span className="text-sm text-muted-foreground">{description}</span>
                                    </span>
                                    <LuArrowRight
                                        className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground"
                                        aria-hidden="true"
                                    />
                                </Link>
                            </li>
                        ))}
                    </ul>
                </aside>
            </section>

            <CourseShelf
                title="What a course looks like"
                lead="Four courses from the catalog, each with its language, level and length."
                className="flex w-full flex-col gap-8"
                titleClassName="text-2xl font-semibold tracking-tight"
            />

            <section aria-labelledby="principles-title" className="flex flex-col gap-8">
                <h2 id="principles-title" className="text-2xl font-semibold tracking-tight">
                    What guides the product
                </h2>
                <ul className="flex list-none flex-col gap-10">
                    {PRINCIPLES.map((principle) => (
                        <li key={principle.title} className="grid gap-2 sm:grid-cols-[minmax(0,18rem)_minmax(0,1fr)] sm:gap-10">
                            <h3 className="text-lg font-semibold text-foreground">{principle.title}</h3>
                            <p className="max-w-[62ch] text-base leading-relaxed text-foreground">
                                {principle.description}
                            </p>
                        </li>
                    ))}
                </ul>
            </section>

            <section
                aria-labelledby="about-cta-title"
                className="flex flex-col gap-5 rounded-lg bg-canvas p-6 sm:p-8 md:flex-row md:items-center md:justify-between"
            >
                <div className="flex flex-col gap-2">
                    <h2 id="about-cta-title" className="text-xl font-semibold tracking-tight">
                        Try a course
                    </h2>
                    <p className="max-w-[52ch] text-base leading-relaxed text-foreground">
                        Browse the catalog without an account, or create one to enroll, save your progress and
                        earn EXP.
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
