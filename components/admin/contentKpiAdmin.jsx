'use client';

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { adminQueries } from "@/queries/premium.query";

import { ErrorReload } from "@/components/ui/error";
import { Badge } from "@/components/shadcn/badge";
import { Button } from "@/components/shadcn/button";
import { Label } from "@/components/shadcn/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/shadcn/select";
import { Skeleton } from "@/components/shadcn/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/shadcn/table";

const TYPE_LABELS = { quiz: "Quiz", mini_coding: "Solve", fix_bug: "Fix bug" };
const percent = (value) => (value === null || value === undefined ? "-" : `${Math.round(value * 100)}%`);
const number = (value) => (value === null || value === undefined ? "-" : String(value));

function Loading() {
    return <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>;
}

function Section({ title, description, children }) {
    return (
        <section className="space-y-3">
            <header className="space-y-0.5">
                <h2 className="text-base font-semibold">{title}</h2>
                {description && <p className="text-sm text-muted-foreground">{description}</p>}
            </header>
            {children}
        </section>
    );
}

function EmptyRow({ colSpan, children }) {
    return <TableRow><TableCell colSpan={colSpan} className="text-center text-muted-foreground">{children}</TableCell></TableRow>;
}

function TierSummary({ tiers }) {
    return (
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead>Tier</TableHead>
                    <TableHead className="text-right">Courses</TableHead>
                    <TableHead className="text-right">Enrolled</TableHead>
                    <TableHead className="text-right">Completed</TableHead>
                    <TableHead className="text-right">Completion</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {tiers.map((t) => (
                    <TableRow key={t.tier}>
                        <TableCell>{t.tier}. {t.label}</TableCell>
                        <TableCell className="text-right tabular-nums">{t.courses}</TableCell>
                        <TableCell className="text-right tabular-nums">{t.enrolled}</TableCell>
                        <TableCell className="text-right tabular-nums">{t.completed}</TableCell>
                        <TableCell className="text-right tabular-nums">{percent(t.completionRate)}</TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    );
}

function ChallengeTable({ challenges }) {
    return (
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead>Challenge</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Tried</TableHead>
                    <TableHead className="text-right">Pass rate</TableHead>
                    <TableHead className="text-right">Avg attempts to pass</TableHead>
                    <TableHead className="text-right">Opened a hint</TableHead>
                    <TableHead className="text-right">Opened hint 3</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {challenges.length === 0 && <EmptyRow colSpan={7}>This course has no published challenges.</EmptyRow>}
                {challenges.map((c) => (
                    <TableRow key={c.id}>
                        <TableCell className="max-w-80">
                            <div className="truncate font-medium" title={c.title}>{c.title}</div>
                            <div className="truncate text-xs text-muted-foreground" title={c.lessonTitle || ""}>{c.lessonTitle || "No lesson"}</div>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                            <Badge variant="muted">{TYPE_LABELS[c.type] || c.type}</Badge>
                            {c.difficulty && <span className="ml-2 text-xs text-muted-foreground">{c.difficulty}</span>}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{c.tried}</TableCell>
                        <TableCell className="text-right tabular-nums">{percent(c.passRate)}</TableCell>
                        <TableCell className="text-right tabular-nums">{number(c.avgAttemptsToPass)}</TableCell>
                        <TableCell className="text-right tabular-nums">{c.hintUsers}</TableCell>
                        <TableCell className="text-right tabular-nums">{c.hintLevel3Users}</TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    );
}

function HardStatements({ statements, thresholds }) {
    if (statements.length === 0) {
        return (
            <p className="text-sm text-muted-foreground">
                No statement is answered wrong by more than {percent(thresholds.wrongRatio)} of its learners
                (statements need at least {thresholds.minAnswered} learners to count).
            </p>
        );
    }
    return (
        <ul className="space-y-3">
            {statements.map((s) => (
                <li key={s.id} className="space-y-1 rounded-md border p-3">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                        <Badge variant="warning">{percent(s.wrongRate)} wrong</Badge>
                        <span className="text-muted-foreground">{s.wrong} of {s.answered} learners · correct answer: {s.correctAnswer}</span>
                    </div>
                    <p className="whitespace-pre-wrap text-sm">{s.statement}</p>
                    <p className="text-xs text-muted-foreground">{s.challengeTitle} ({s.challengeId})</p>
                </li>
            ))}
        </ul>
    );
}

function ExpAudit() {
    const [requested, setRequested] = useState(false);
    const { data, isFetching, isError, refetch } = useQuery(adminQueries.expAudit(requested));

    return (
        <Section
            title="EXP audit"
            description="Ledger reconciliation and the last 24 hours' anomalies. Runs daily (cron); this only reports, it never changes EXP."
        >
            <Button size="sm" variant="outline" disabled={isFetching} onClick={() => (requested ? refetch() : setRequested(true))}>
                {isFetching ? "Running..." : data ? "Run again" : "Run audit"}
            </Button>
            {isError && <ErrorReload refetch={refetch} />}
            {data && (
                <div className="space-y-4 text-sm">
                    <p className="text-xs text-muted-foreground">Generated {new Date(data.generatedAt).toLocaleString()}</p>

                    <div className="space-y-1">
                        <h3 className="font-medium">Cached EXP / level vs ledger: {data.reconciliation.total} user(s)</h3>
                        {data.reconciliation.users.length > 0 && (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>User</TableHead>
                                        <TableHead className="text-right">Cached EXP</TableHead>
                                        <TableHead className="text-right">Ledger EXP</TableHead>
                                        <TableHead className="text-right">Cached level</TableHead>
                                        <TableHead className="text-right">Ledger level</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {data.reconciliation.users.map((u) => (
                                        <TableRow key={u.userId}>
                                            <TableCell>{u.username}</TableCell>
                                            <TableCell className="text-right tabular-nums">{u.cachedExp}</TableCell>
                                            <TableCell className="text-right tabular-nums">{u.ledgerExp}</TableCell>
                                            <TableCell className="text-right tabular-nums">{u.cachedLevel}</TableCell>
                                            <TableCell className="text-right tabular-nums">{u.ledgerLevel}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </div>

                    <div className="space-y-1">
                        <h3 className="font-medium">EXP gained in 24 h above the daily p99</h3>
                        <p className="text-muted-foreground">
                            p99 = {number(data.anomalies.dailyExp.p99)} EXP over {data.anomalies.dailyExp.samples} user-days
                            (last {data.anomalies.dailyExp.baselineDays} days).
                        </p>
                        {data.anomalies.dailyExp.users.length === 0
                            ? <p className="text-muted-foreground">Nobody above it.</p>
                            : (
                                <ul className="list-disc pl-5">
                                    {data.anomalies.dailyExp.users.map((u) => (
                                        <li key={u.userId}>{u.username}: {u.gained} EXP in {u.transactions} reward(s)</li>
                                    ))}
                                </ul>
                            )}
                    </div>

                    <div className="space-y-1">
                        <h3 className="font-medium">Same passing code from several accounts</h3>
                        {data.anomalies.sharedSolutions.length === 0
                            ? <p className="text-muted-foreground">None in the last 24 hours.</p>
                            : (
                                <ul className="list-disc pl-5">
                                    {data.anomalies.sharedSolutions.map((s) => (
                                        <li key={`${s.challengeId}-${s.codeHash}`}>
                                            {s.challengeTitle} ({s.courseId}): {s.accounts} accounts, {s.usernames.join(", ")}
                                        </li>
                                    ))}
                                </ul>
                            )}
                    </div>

                    <div className="space-y-1">
                        <h3 className="font-medium">Quiz answered unusually fast</h3>
                        <p className="text-muted-foreground">{data.anomalies.fastQuizAnswers.note}</p>
                    </div>
                </div>
            )}
        </Section>
    );
}

/** Content KPIs of one course (V1.3 §11.3, §11.6) and the EXP audit report. Read-only. */
export default function ContentKpiAdmin() {
    const courses = useQuery(adminQueries.courses());
    const [picked, setPicked] = useState(null);
    const list = courses.data?.courses || [];
    const courseId = picked || list[0]?.id || null;
    const kpis = useQuery(adminQueries.contentKpis(courseId));

    if (courses.isPending) return <Loading />;
    if (courses.isError) return <ErrorReload refetch={courses.refetch} />;

    const data = kpis.data;

    return (
        <div className="space-y-8">
            <div className="max-w-md space-y-1.5">
                <Label htmlFor="kpi-course">Course</Label>
                <Select value={courseId || undefined} onValueChange={setPicked}>
                    <SelectTrigger id="kpi-course" className="w-full"><SelectValue placeholder="Choose a course" /></SelectTrigger>
                    <SelectContent>
                        {list.map((course) => (
                            <SelectItem key={course.id} value={course.id}>{course.title}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {kpis.isPending && courseId && <Loading />}
            {kpis.isError && <ErrorReload refetch={kpis.refetch} />}
            {data && (
                <>
                    <Section title="Completion by tier" description="Every course that is not deleted; unenrolled learners excluded.">
                        <TierSummary tiers={data.tiers} />
                        <p className="text-sm">
                            This course ({data.course.level || "no level"}): {data.completion.completed} of {data.completion.enrolled} enrolled
                            learners completed ({percent(data.completion.completionRate)}).
                        </p>
                    </Section>

                    <Section
                        title="Challenges"
                        description="In lesson order. Attempts to pass counts the passing attempt (1 = passed first try); quiz attempts are whole quiz submissions."
                    >
                        <ChallengeTable challenges={data.challenges} />
                    </Section>

                    <Section title="True/False statements most learners get wrong" description="First answer of each learner only.">
                        <HardStatements statements={data.hardStatements} thresholds={data.thresholds} />
                    </Section>
                </>
            )}

            <ExpAudit />
        </div>
    );
}
