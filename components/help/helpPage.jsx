'use client';

import { useState } from "react";
import Link from "next/link";

import { useQueryParams } from "@/router/useQueryParams";

import { InputGroup } from "@/components/ui/input";

import { Button } from "@/components/shadcn/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/shadcn/collapsible";

import {
    LuBookOpen,
    LuChevronDown,
    LuMessageSquareText,
    LuSearch,
    LuSearchX,
} from "react-icons/lu";

const QUICK_TOPICS = [
    { label: 'Courses', query: 'course' },
    { label: 'Challenges', query: 'challenge' },
    { label: 'Points', query: 'points' },
    { label: 'Profile', query: 'profile' },
];

const FAQS = [
    {
        id: 'enroll',
        q: 'How do I start a course?',
        a: 'Open Courses from the sidebar, pick a course and enroll. It then appears in My learning, where you can start the first lesson and track how many lessons you have completed.',
    },
    {
        id: 'withdraw',
        q: 'Can I leave a course I enrolled in?',
        a: 'Yes, as long as you have not started it. In My learning, open the actions menu on the course row and choose Withdraw. Once you start a course, it stays in your list with your progress saved.',
    },
    {
        id: 'challenge-grading',
        q: 'How are coding challenges graded?',
        a: 'Your solution is run against the test cases defined for the challenge. Depending on the challenge, you either earn the full points when every test passes or a share of the points for each passing test.',
    },
    {
        id: 'challenge-limit',
        q: 'Why does a submission say I have to wait before retrying?',
        a: 'Quiz and coding submissions are rate limited to keep the grader responsive. Wait for the number of seconds shown in the message, then submit again.',
    },
    {
        id: 'points',
        q: 'Where do my points come from?',
        a: 'Points are added to your account when you answer quiz questions correctly and pass coding challenge tests. Your total is shown in the account menu and on your profile.',
    },
    {
        id: 'profile-edit',
        q: 'How do I change my name, photo or email?',
        a: 'Go to Settings from the account menu. Each section, such as Profile photo, Personal information and Account, has its own save button. Your username cannot be changed.',
    },
    {
        id: 'roadmaps',
        q: 'What are roadmaps for?',
        a: 'Roadmaps lay out a learning path for a topic as a sequence of steps, so you can see what to study next.',
    },
    {
        id: 'feedback',
        q: 'How do I report a problem or suggest an improvement?',
        a: 'Use Send feedback in the account menu or the button at the bottom of this page. Describe what happened and what you expected, and the team will review it.',
    },
];

export default function HelpPage() {
    const updateQuery = useQueryParams();

    const [searchQuery, setSearchQuery] = useState("");
    const [openFaq, setOpenFaq] = useState(FAQS[0].id);

    const query = searchQuery.trim().toLowerCase();
    const filteredFaqs = FAQS.filter(
        (faq) => faq.q.toLowerCase().includes(query) || faq.a.toLowerCase().includes(query)
    );

    return (
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 pt-6 pb-10 sm:px-6 lg:pt-10">
            <header className="space-y-2">
                <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">Help center</h1>
                <p className="max-w-[60ch] text-sm text-muted-foreground">
                    Answers to common questions about courses, challenges, points and your account.
                </p>
            </header>

            <section aria-label="Search help" className="flex flex-col gap-3">
                <InputGroup
                    name="help-search"
                    label="Search questions"
                    type="search"
                    placeholder="Search by keyword, for example challenge"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    reset={() => setSearchQuery("")}
                    icon={<LuSearch />}
                />
                <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-muted-foreground">Popular topics</span>
                    {QUICK_TOPICS.map((topic) => {
                        const active = query === topic.query;
                        return (
                            <Button
                                key={topic.query}
                                type="button"
                                size="xs"
                                variant={active ? 'soft' : 'outline'}
                                aria-pressed={active}
                                onClick={() => setSearchQuery(active ? '' : topic.query)}
                            >
                                {topic.label}
                            </Button>
                        );
                    })}
                </div>
            </section>

            <section aria-labelledby="help-faq-heading" className="flex flex-col gap-3">
                <div className="flex min-h-8 items-center justify-between gap-3">
                    <h2 id="help-faq-heading" className="text-base font-semibold text-foreground">
                        Frequently asked questions
                    </h2>
                    <span className="font-mono text-xs text-muted-foreground tabular" aria-live="polite">
                        {filteredFaqs.length} of {FAQS.length}
                    </span>
                </div>

                {filteredFaqs.length > 0 ? (
                    <ul className="m-0 list-none divide-y overflow-hidden rounded-lg border bg-card p-0">
                        {filteredFaqs.map((faq) => {
                            const isOpen = openFaq === faq.id;
                            return (
                                <li key={faq.id}>
                                    <Collapsible
                                        open={isOpen}
                                        onOpenChange={(open) => setOpenFaq(open ? faq.id : null)}
                                    >
                                        <h3 className="m-0 text-sm font-medium">
                                            <CollapsibleTrigger className="group/faq flex min-h-12 w-full items-center justify-between gap-4 px-4 py-3 text-left text-foreground transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset">
                                                <span>{faq.q}</span>
                                                <LuChevronDown
                                                    className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=open]/faq:rotate-180"
                                                    aria-hidden="true"
                                                />
                                            </CollapsibleTrigger>
                                        </h3>
                                        <CollapsibleContent>
                                            <p className="m-0 max-w-[70ch] px-4 pb-4 text-sm leading-relaxed text-muted-foreground">
                                                {faq.a}
                                            </p>
                                        </CollapsibleContent>
                                    </Collapsible>
                                </li>
                            );
                        })}
                    </ul>
                ) : (
                    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed px-6 py-12 text-center">
                        <span className="flex size-10 items-center justify-center rounded-md bg-muted text-muted-foreground">
                            <LuSearchX className="size-5" aria-hidden="true" />
                        </span>
                        <div className="space-y-1">
                            <h3 className="text-sm font-semibold">No matching questions</h3>
                            <p className="max-w-[48ch] text-sm break-words text-muted-foreground">
                                Nothing matches &quot;{searchQuery}&quot;. Try a shorter keyword or send us your question.
                            </p>
                        </div>
                        <Button variant="outline" size="sm" onClick={() => setSearchQuery("")}>
                            Clear search
                        </Button>
                    </div>
                )}
            </section>

            <section
                aria-labelledby="help-contact-heading"
                className="flex flex-col gap-4 rounded-lg border bg-card p-4 sm:flex-row sm:items-center sm:justify-between"
            >
                <div className="space-y-1">
                    <h2 id="help-contact-heading" className="text-base font-semibold text-foreground">
                        Still stuck?
                    </h2>
                    <p className="max-w-[56ch] text-sm text-muted-foreground">
                        Send the team a short note about the problem, or go back to your courses.
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button asChild variant="outline">
                        <Link href="/learning"><LuBookOpen />My learning</Link>
                    </Button>
                    <Button onClick={() => updateQuery({ modal: 'feedback' })}>
                        <LuMessageSquareText />
                        Send feedback
                    </Button>
                </div>
            </section>
        </div>
    );
}
