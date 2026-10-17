'use client';

import { Button } from "@/components/shadcn/button";

import { LuBriefcase, LuContainer, LuDownload, LuTerminal } from "react-icons/lu";

// Lesson framing from Sanity: the real-world scenario and the local environment for the lab.
export default function LessonBrief({ lessonId, scenario, environmentSetup }) {
    const hasScenario = Boolean(scenario?.problem);
    const steps = (environmentSetup?.setupSteps || []).filter((step) => step?.command || step?.label);
    const hasSetup = Boolean(environmentSetup?.starterAssetKey || environmentSetup?.dockerImage || steps.length);

    if (!hasScenario && !hasSetup) return null;

    return (
        <div className="mt-6 grid gap-4">
            {hasScenario && (
                <section aria-labelledby="lesson-scenario-heading" className="rounded-lg border bg-card p-5">
                    <h2 id="lesson-scenario-heading" className="flex items-center gap-2 text-sm font-semibold">
                        <LuBriefcase className="size-4 text-muted-foreground" aria-hidden="true" />
                        Scenario
                    </h2>
                    {scenario.role && (
                        <p className="mt-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            You are: {scenario.role}
                        </p>
                    )}
                    <p className="mt-2 max-w-[65ch] text-sm leading-relaxed whitespace-pre-line">{scenario.problem}</p>
                </section>
            )}

            {hasSetup && (
                <section aria-labelledby="lesson-setup-heading" className="rounded-lg border bg-card p-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <h2 id="lesson-setup-heading" className="flex items-center gap-2 text-sm font-semibold">
                            <LuTerminal className="size-4 text-muted-foreground" aria-hidden="true" />
                            Local lab
                        </h2>
                        {environmentSetup.starterAssetKey && (
                            <Button asChild size="sm" variant="outline">
                                <a href={`/api/course/lesson-starter?lessonId=${encodeURIComponent(lessonId)}`} download>
                                    <LuDownload aria-hidden="true" />
                                    Download starter project
                                </a>
                            </Button>
                        )}
                    </div>

                    {environmentSetup.dockerImage && (
                        <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                            <LuContainer className="size-3.5" aria-hidden="true" />
                            Requires Docker image <code className="font-mono text-foreground">{environmentSetup.dockerImage}</code>
                        </p>
                    )}

                    {steps.length > 0 && (
                        <ol className="mt-4 space-y-3">
                            {steps.map((step, index) => (
                                <li key={step._key || index} className="grid grid-cols-[1.5rem_1fr] gap-x-2 text-sm">
                                    <span className="font-mono text-xs leading-6 text-muted-foreground tabular">{index + 1}.</span>
                                    <span className="min-w-0 space-y-1.5">
                                        {step.label && <span className="block leading-6">{step.label}</span>}
                                        {step.command && (
                                            <code className="block overflow-x-auto rounded-md border bg-muted px-3 py-2 font-mono text-xs whitespace-pre">
                                                {step.command}
                                            </code>
                                        )}
                                    </span>
                                </li>
                            ))}
                        </ol>
                    )}
                </section>
            )}
        </div>
    );
}
