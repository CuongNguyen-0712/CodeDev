"use client";

import Link from "next/link";

import { PrismLight as SyntaxHighlighter } from "react-syntax-highlighter";
import javascript from "react-syntax-highlighter/dist/esm/languages/prism/javascript";

import { Button } from "@/components/shadcn/button";
import { syntaxTheme } from "@/lib/syntaxTheme";

import { SiJavascript } from "react-icons/si";
import {
    LuArrowRight,
    LuLibrary,
    LuListChecks,
    LuMap,
    LuSquareTerminal,
    LuTrendingUp,
    LuUsers,
} from "react-icons/lu";

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

const SAMPLE_TESTS = [
    { call: "twoSum([2, 7, 11, 15], 9)", expected: "[0, 1]" },
    { call: "twoSum([3, 2, 4], 6)", expected: "[1, 2]" },
];

const FEATURES = [
    {
        icon: LuLibrary,
        title: "Courses with structured lessons",
        description: "Browse the catalog by level, enroll, and work through written lessons in order.",
        href: "/course",
        linkLabel: "Browse courses",
    },
    {
        icon: LuSquareTerminal,
        title: "Coding challenges in the browser",
        description: "Write JavaScript in the editor and run the sample tests instantly. Submitting grades your code against hidden tests as well.",
    },
    {
        icon: LuListChecks,
        title: "Quizzes after lessons",
        description: "Some lessons end with a short quiz so you can check the idea stuck before moving on.",
    },
    {
        icon: LuTrendingUp,
        title: "Progress you can resume",
        description: "My learning lists every course you are enrolled in with your progress, so you always know what is next.",
    },
    {
        icon: LuMap,
        title: "Roadmaps",
        description: "Follow a roadmap when you want a suggested order across several topics.",
        href: "/roadmap",
        linkLabel: "View roadmaps",
    },
    {
        icon: LuUsers,
        title: "Other learners",
        description: "Find people to learn with, add them as contacts and form study teams.",
    },
];

const STEPS = [
    {
        title: "Pick a course",
        description: "Filter the catalog by level and enroll in something that fits where you are.",
    },
    {
        title: "Read the lesson",
        description: "Each lesson explains one idea in writing, with code examples alongside.",
    },
    {
        title: "Solve the challenge",
        description: "Run the sample tests while you work, then submit to be graded.",
    },
    {
        title: "Keep going",
        description: "Come back later and continue from the lesson where you stopped.",
    },
];

// Light build with only JavaScript registered: the landing page should not ship every Prism grammar.
SyntaxHighlighter.registerLanguage("javascript", javascript);

function CodeSample() {
    return (
        <figure
            aria-label="Example coding challenge"
            className="min-w-0 overflow-hidden rounded-lg border border-editor-border bg-editor text-editor-foreground"
        >
            <div className="flex h-10 items-center gap-2 border-b border-editor-border bg-editor-panel px-3">
                <SiJavascript className="size-3.5 shrink-0 text-editor-muted" aria-hidden="true" />
                <span className="font-mono text-xs">solution.js</span>
            </div>

            {/* Same Dracula theme as the editor and lesson code blocks (lib/syntaxTheme.js). */}
            <div
                tabIndex={0}
                role="region"
                aria-label="Example solution code"
                className="overflow-x-auto py-3 font-mono text-[13px] leading-6 outline-none focus-visible:ring-2 focus-visible:ring-editor-accent/60 focus-visible:ring-inset"
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

            <figcaption className="border-t border-editor-border bg-editor-panel px-3 py-3">
                <p className="mb-2 text-xs font-medium text-editor-muted">Sample tests</p>
                <ul className="flex list-none flex-col gap-1.5">
                    {SAMPLE_TESTS.map((test) => (
                        <li
                            key={test.call}
                            className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 rounded-md bg-editor-raised px-2.5 py-1.5 font-mono text-xs"
                        >
                            <span className="break-all">{test.call}</span>
                            <span className="text-editor-muted">
                                expected <span className="text-editor-foreground">{test.expected}</span>
                            </span>
                        </li>
                    ))}
                </ul>
                <p className="mt-2 text-xs text-editor-muted">Hidden tests run when you submit.</p>
            </figcaption>
        </figure>
    );
}

export default function IndexPage() {
    return (
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-16 px-4 pt-8 pb-12 sm:px-6 lg:gap-24 lg:pt-14">
            <section
                aria-labelledby="landing-title"
                className="grid items-center gap-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-14"
            >
                <div className="flex flex-col items-start gap-6">
                    <h1
                        id="landing-title"
                        className="max-w-[20ch] text-4xl font-semibold tracking-tight text-balance text-foreground sm:text-5xl lg:text-6xl"
                    >
                        Learn to code by writing code
                    </h1>
                    <p className="max-w-[52ch] text-base leading-relaxed text-pretty text-muted-foreground sm:text-lg">
                        CodeDev pairs short written lessons with coding challenges you solve right in the browser.
                        Run the sample tests as you work, submit for grading, and pick up where you left off next time.
                    </p>
                    <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                        <Button asChild size="lg">
                            <Link href="/auth">
                                Get started
                                <LuArrowRight />
                            </Link>
                        </Button>
                        <Button asChild size="lg" variant="outline">
                            <Link href="/course">
                                <LuLibrary />
                                Browse courses
                            </Link>
                        </Button>
                    </div>
                    <p className="text-sm text-muted-foreground">Creating an account is free.</p>
                </div>

                <CodeSample />
            </section>

            <section aria-labelledby="features-title" className="grid gap-8 lg:grid-cols-12 lg:gap-10">
                <div className="flex flex-col gap-3 lg:col-span-4">
                    <h2 id="features-title" className="text-2xl font-semibold tracking-tight sm:text-3xl">
                        What you get
                    </h2>
                    <p className="max-w-[44ch] text-sm leading-relaxed text-muted-foreground">
                        Everything you need to go from reading about an idea to writing working code for it, in one place.
                    </p>
                </div>

                <ul className="flex list-none flex-col divide-y rounded-lg border lg:col-span-8">
                    {FEATURES.map(({ icon: Icon, title, description, href, linkLabel }) => (
                        <li key={title} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:gap-4 sm:p-5">
                            <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-foreground">
                                <Icon className="size-4" aria-hidden="true" />
                            </span>
                            <div className="flex min-w-0 flex-1 flex-col gap-1">
                                <h3 className="text-sm font-semibold text-foreground">{title}</h3>
                                <p className="max-w-[60ch] text-sm leading-relaxed text-muted-foreground">{description}</p>
                            </div>
                            {href && (
                                <Button asChild variant="ghost" size="sm" className="self-start sm:-my-1">
                                    <Link href={href}>
                                        {linkLabel}
                                        <LuArrowRight />
                                    </Link>
                                </Button>
                            )}
                        </li>
                    ))}
                </ul>
            </section>

            <section aria-labelledby="steps-title" className="flex flex-col gap-6">
                <div className="flex flex-col gap-3">
                    <h2 id="steps-title" className="text-2xl font-semibold tracking-tight sm:text-3xl">
                        How learning works
                    </h2>
                    <p className="max-w-[60ch] text-sm leading-relaxed text-muted-foreground">
                        Every course follows the same loop, so you spend your time on the material instead of the tool.
                    </p>
                </div>

                <ol className="grid list-none gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-2 lg:grid-cols-4">
                    {STEPS.map((step, index) => (
                        <li key={step.title} className="flex flex-col gap-3 bg-background p-5">
                            <span
                                aria-hidden="true"
                                className="tabular flex size-7 items-center justify-center rounded-md border font-mono text-xs text-muted-foreground"
                            >
                                {index + 1}
                            </span>
                            <div className="flex flex-col gap-1">
                                <h3 className="text-sm font-semibold text-foreground">
                                    <span className="sr-only">Step {index + 1}: </span>
                                    {step.title}
                                </h3>
                                <p className="text-sm leading-relaxed text-muted-foreground">{step.description}</p>
                            </div>
                        </li>
                    ))}
                </ol>
            </section>

            <section
                aria-labelledby="cta-title"
                className="flex flex-col gap-5 rounded-lg border bg-muted/40 p-6 sm:p-8 md:flex-row md:items-center md:justify-between"
            >
                <div className="flex flex-col gap-2">
                    <h2 id="cta-title" className="text-xl font-semibold tracking-tight sm:text-2xl">
                        Ready to write your first solution?
                    </h2>
                    <p className="max-w-[52ch] text-sm leading-relaxed text-muted-foreground">
                        Create an account to enroll in courses, submit challenges and keep track of your progress.
                    </p>
                </div>
                <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
                    <Button asChild>
                        <Link href="/auth">Create an account</Link>
                    </Button>
                    <Button asChild variant="outline">
                        <Link href="/roadmap">
                            <LuMap />
                            View roadmaps
                        </Link>
                    </Button>
                </div>
            </section>
        </div>
    );
}
