"use client";

import { useState } from "react";

import Link from "next/link";
import { useInfiniteQuery } from "@tanstack/react-query";

import { PrismLight as SyntaxHighlighter } from "react-syntax-highlighter";
import javascript from "react-syntax-highlighter/dist/esm/languages/prism/javascript";

import { courseQueries } from "@/queries/course.query";
import { levelMapping } from "@/constants/constants";
import { fitCover } from "@/lib/coverFit";

import { Button } from "@/components/shadcn/button";
import { Skeleton } from "@/components/shadcn/skeleton";
import { syntaxTheme } from "@/lib/syntaxTheme";

import { SiJavascript } from "react-icons/si";
import { LuArrowRight, LuCircleCheck, LuPlay } from "react-icons/lu";

// A sample in the shape of a real CodeDev coding challenge: starter function,
// visible sample tests, hidden tests on submit.
const SAMPLE_CODE = `// Return the indices of the two numbers that add up to target.
function twoSum(nums, target) {
  const seen = new Map();

  for (let i = 0; i < nums.length; i++) {
    const need = target - nums[i];
    if (seen.has(need)) return [seen.get(need), i];
    seen.set(nums[i], i);
  }

  return [];
}`;

// The same function as SAMPLE_CODE, so "Run tests" really runs what the visitor reads.
function twoSum(nums, target) {
    const seen = new Map();

    for (let i = 0; i < nums.length; i++) {
        const need = target - nums[i];
        if (seen.has(need)) return [seen.get(need), i];
        seen.set(nums[i], i);
    }

    return [];
}

const SAMPLE_TESTS = [
    { call: "twoSum([2, 7, 11, 15], 9)", args: [[2, 7, 11, 15], 9], expected: [0, 1] },
    { call: "twoSum([3, 2, 4], 6)", args: [[3, 2, 4], 6], expected: [1, 2] },
    { call: "twoSum([3, 3], 6)", args: [[3, 3], 6], expected: [0, 1] },
];

const show = (value) => JSON.stringify(value).replace(/,/g, ", ");

const LOOP = [
    {
        term: "Read one idea",
        detail: "Each lesson explains a single idea in writing, starting from a real bug, with code you can copy next to it.",
    },
    {
        term: "Run the sample tests",
        detail: "The challenge opens in an editor in your browser. Run the visible tests as often as you like while you work.",
    },
    {
        term: "Submit for grading",
        detail: "Submitting also runs hidden tests, so a pass means the code handles more than the examples.",
    },
    {
        term: "Pick up where you stopped",
        detail: "My learning keeps every enrolled course with its progress, so the next lesson is one click away.",
    },
];

const EXTRAS = [
    {
        title: "Roadmaps",
        detail: "A suggested order across courses for roles like frontend, backend or data.",
        href: "/roadmap",
        link: "View roadmaps",
    },
    {
        title: "Quizzes",
        detail: "Some lessons end with a short quiz to check the idea stuck before you move on.",
    },
    {
        title: "Other learners",
        detail: "Find people by username, add them as contacts and compare progress on the leaderboard.",
        href: "/ranking",
        link: "See the leaderboard",
    },
];

// Light build with only JavaScript registered: the landing page should not ship every Prism grammar.
SyntaxHighlighter.registerLanguage("javascript", javascript);

function CodeSample() {
    // null until the visitor runs the tests; then one result per sample test.
    const [results, setResults] = useState(null);

    const runTests = () => {
        setResults(SAMPLE_TESTS.map((test) => {
            const started = performance.now();
            const got = twoSum(...test.args);
            return { got, passed: show(got) === show(test.expected), ms: performance.now() - started };
        }));
    };

    const passed = results?.filter((result) => result.passed).length ?? 0;

    return (
        <figure
            aria-label="Example coding challenge"
            className="min-w-0 overflow-hidden rounded-lg bg-editor text-editor-foreground"
        >
            <div className="flex h-12 items-center gap-2 bg-editor-panel pr-2 pl-4">
                <SiJavascript className="size-3.5 shrink-0 text-editor-muted" aria-hidden="true" />
                <span className="font-mono text-xs">solution.js</span>
                <Button size="sm" onClick={runTests} className="ml-auto">
                    <LuPlay aria-hidden="true" />
                    {results ? "Run again" : "Run tests"}
                </Button>
            </div>

            {/* Same Dracula theme as the editor and lesson code blocks (lib/syntaxTheme.js). */}
            <div
                tabIndex={0}
                role="region"
                aria-label="Example solution code"
                className="overflow-x-auto py-4 font-mono text-[13px] leading-6 outline-none focus-visible:ring-2 focus-visible:ring-editor-accent/60 focus-visible:ring-inset"
            >
                <SyntaxHighlighter
                    language="javascript"
                    style={syntaxTheme}
                    PreTag="div"
                    showLineNumbers
                    lineNumberStyle={{ minWidth: "2.5em", paddingRight: "1em", color: "var(--editor-gutter)", textAlign: "right", userSelect: "none" }}
                    customStyle={{ margin: 0, padding: "0 1em 0 0", background: "transparent", overflow: "visible", width: "max-content", minWidth: "100%" }}
                >
                    {SAMPLE_CODE}
                </SyntaxHighlighter>
            </div>

            <figcaption className="bg-editor-panel px-4 py-4">
                <p className="mb-3 text-sm text-editor-muted" aria-live="polite">
                    {results
                        ? <span className={passed === results.length ? "text-editor-success" : "text-editor-danger"}>{passed} of {results.length} sample tests passed</span>
                        : "Sample tests"}
                </p>
                <ul className="flex list-none flex-col gap-1.5">
                    {SAMPLE_TESTS.map((test, index) => {
                        const result = results?.[index];
                        return (
                            <li
                                key={test.call}
                                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-0.5 rounded-md bg-editor-raised px-3 py-2 font-mono text-xs"
                            >
                                <span className="flex min-w-0 items-center gap-2 break-all">
                                    {result && (
                                        <LuCircleCheck
                                            className={result.passed ? "size-3.5 shrink-0 text-editor-success" : "size-3.5 shrink-0 text-editor-danger"}
                                            aria-label={result.passed ? "Passed" : "Failed"}
                                        />
                                    )}
                                    {test.call}
                                </span>
                                <span className="text-editor-muted">
                                    {result ? "got" : "expected"}{" "}
                                    <span className="text-editor-foreground">{show(result ? result.got : test.expected)}</span>
                                    {result && <span className="ml-2">{result.ms < 1 ? "<1" : Math.round(result.ms)} ms</span>}
                                </span>
                            </li>
                        );
                    })}
                </ul>
                <p className="mt-3 text-xs text-editor-muted">Hidden tests run when you submit.</p>
            </figcaption>
        </figure>
    );
}

function CourseShelf() {
    const { data, isLoading, isError } = useInfiniteQuery(courseQueries.list({}, { limit: 4 }));
    const courses = (data?.pages?.[0]?.data ?? []).slice(0, 4);

    // Supporting section: without courses there is nothing to show, so it stays out of the page.
    if (isError || (!isLoading && courses.length === 0)) return null;

    return (
        <section aria-labelledby="shelf-title" className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 sm:px-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-8">
                <div className="flex max-w-2xl flex-col gap-3">
                    <h2 id="shelf-title" className="text-3xl font-semibold tracking-tight sm:text-4xl">
                        Start with a real course
                    </h2>
                    <p className="text-base leading-relaxed text-foreground sm:text-lg">
                        Every lesson opens with a bug someone actually shipped, then walks you to the fix.
                    </p>
                </div>
                <Link
                    href="/course"
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-sm text-sm font-medium text-primary-ink underline-offset-4 hover:underline"
                >
                    See the whole catalog
                    <LuArrowRight className="size-4" aria-hidden="true" />
                </Link>
            </div>

            <ul className="grid list-none gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
                {isLoading
                    ? Array.from({ length: 4 }, (_, index) => (
                        <li key={index} className="flex flex-col gap-3" aria-hidden="true">
                            <Skeleton className="aspect-video w-full rounded-md" />
                            <Skeleton className="h-5 w-4/5" />
                            <Skeleton className="h-4 w-1/2" />
                        </li>
                    ))
                    : courses.map((course, index) => (
                        <li key={course.id} className="animate-enter" style={{ "--enter-index": index }}>
                            <Link href={`/course/${course.id}`} className="group/shelf flex flex-col gap-3 rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
                                <span className="block aspect-video overflow-hidden rounded-md bg-muted">
                                    {course.image && (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img
                                            ref={fitCover}
                                            src={course.image}
                                            alt=""
                                            loading="lazy"
                                            draggable={false}
                                            className="block size-full object-cover transition-transform duration-300 ease-out group-hover/shelf:scale-[1.03] data-[fit=contain]:object-contain data-[fit=contain]:p-[12%]"
                                            onLoad={(e) => fitCover(e.currentTarget)}
                                        />
                                    )}
                                </span>
                                <span className="text-base leading-snug font-semibold text-foreground group-hover/shelf:text-primary-ink">
                                    {course.title}
                                </span>
                                <span className="tabular text-sm text-muted-foreground">
                                    {[course.language_name, levelMapping[course.level]?.label, `${Number(course.lessons) || 0} lessons`].filter(Boolean).join(" · ")}
                                </span>
                            </Link>
                        </li>
                    ))}
            </ul>
        </section>
    );
}

export default function IndexPage() {
    return (
        <div className="flex w-full flex-col gap-24 pt-10 lg:gap-36 lg:pt-16">
            <section aria-labelledby="landing-title" className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 sm:px-6 lg:gap-14">
                <h1
                    id="landing-title"
                    className="max-w-[18ch] text-5xl leading-[0.98] font-semibold tracking-[-0.035em] text-foreground lg:text-7xl xl:text-[6.25rem]"
                >
                    Learn to code by writing code
                </h1>

                <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-14">
                    <div className="flex flex-col items-start gap-7 lg:pt-2">
                        <p className="max-w-[44ch] text-lg leading-relaxed text-foreground sm:text-xl">
                            Short written lessons, each followed by a coding challenge you solve in the browser.
                            Run its sample tests here to see how every challenge works.
                        </p>
                        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center sm:gap-6">
                            <Button asChild size="lg">
                                <Link href="/auth">
                                    Create a free account
                                    <LuArrowRight />
                                </Link>
                            </Button>
                            <Link
                                href="/course"
                                className="inline-flex items-center justify-center gap-1.5 rounded-sm py-2 text-sm font-medium text-foreground underline-offset-4 hover:underline"
                            >
                                Browse courses first
                            </Link>
                        </div>
                    </div>

                    <CodeSample />
                </div>
            </section>

            <CourseShelf />

            <section aria-labelledby="loop-title" className="w-full bg-canvas py-20 lg:py-28">
                <div className="mx-auto grid w-full max-w-6xl gap-12 px-4 sm:px-6 lg:grid-cols-12 lg:gap-10">
                    <div className="flex flex-col gap-4 lg:col-span-5">
                        <h2 id="loop-title" className="max-w-[14ch] text-3xl font-semibold tracking-tight sm:text-4xl">
                            Every lesson ends in code you run
                        </h2>
                        <p className="max-w-[40ch] text-base leading-relaxed text-foreground sm:text-lg">
                            The same loop in every course, so your attention goes to the material and not to the tool.
                        </p>
                    </div>
                    <dl className="grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:col-span-7">
                        {LOOP.map((item) => (
                            <div key={item.term} className="flex flex-col gap-2">
                                <dt className="text-lg font-semibold text-foreground">{item.term}</dt>
                                <dd className="text-base leading-relaxed text-muted-foreground">{item.detail}</dd>
                            </div>
                        ))}
                    </dl>
                </div>
            </section>

            <section aria-labelledby="extras-title" className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 sm:px-6">
                <h2 id="extras-title" className="text-2xl font-semibold tracking-tight sm:text-3xl">
                    Around the courses
                </h2>
                <ul className="grid list-none gap-10 md:grid-cols-3 md:gap-8">
                    {EXTRAS.map((extra) => (
                        <li key={extra.title} className="flex flex-col items-start gap-2">
                            <h3 className="text-lg font-semibold text-foreground">{extra.title}</h3>
                            <p className="max-w-[38ch] text-base leading-relaxed text-muted-foreground">{extra.detail}</p>
                            {extra.href && (
                                <Link
                                    href={extra.href}
                                    className="mt-1 inline-flex items-center gap-1.5 rounded-sm text-sm font-medium text-primary-ink underline-offset-4 hover:underline"
                                >
                                    {extra.link}
                                    <LuArrowRight className="size-4" aria-hidden="true" />
                                </Link>
                            )}
                        </li>
                    ))}
                </ul>
            </section>

            <section aria-labelledby="cta-title" className="logo-on-dark w-full bg-editor py-20 text-editor-foreground lg:py-28 dark:bg-card">
                <div className="mx-auto flex w-full max-w-6xl flex-col items-start gap-8 px-4 sm:px-6">
                    <h2 id="cta-title" className="max-w-[22ch] text-4xl leading-[1.02] font-semibold tracking-[-0.03em] lg:text-6xl">
                        Write your first passing test
                    </h2>
                    <Button asChild size="lg">
                        <Link href="/auth">
                            Create a free account
                            <LuArrowRight />
                        </Link>
                    </Button>
                </div>
            </section>
        </div>
    );
}
