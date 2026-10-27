#!/usr/bin/env node
/**
 * Checks a course of the V1.3 architecture track against its Definition of Done
 * (docs/master-plan-v1.3-adaptation.md P5): course metadata, counts per tier, True/False balance,
 * the scenario, learning-outcome coverage, hints and hidden tests. Runs on the content files only;
 * verify-challenges.mjs still runs the code.
 *
 * Usage: node content/tools/verify-course.mjs content/courses/<course>
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const DOMAINS = ["frontend", "backend", "data", "devops", "quality", "system-design", "ai"];

// V1.3 §5.2. Minimums: extra practice is allowed on top.
export const TIERS = {
    1: { lessons: 10, trueFalse: 20, coding: { mini_coding: { easy: 4 }, fix_bug: { easy: 2 } } },
    2: { lessons: 12, trueFalse: 25, coding: { mini_coding: { easy: 2, medium: 4 }, fix_bug: { medium: 2 } } },
    3: { lessons: 12, trueFalse: 25, coding: { mini_coding: { medium: 4, hard: 2 }, fix_bug: { medium: 2, hard: 1 } } },
    4: { lessons: 15, trueFalse: 30, coding: { mini_coding: { medium: 3, hard: 4 }, fix_bug: { hard: 2 } } },
};
const TIER_BY_LEVEL = { beginner: 1, intermediate: 2, advanced: 3, expert: 4, master: 4 };

const isTrueFalse = (q) => q.type === "single_choice" && q.options?.length === 2
    && q.options[0].text === "True" && q.options[1].text === "False"
    && q.options.filter((o) => o.correct).length === 1;
const nonEmpty = (s) => typeof s === "string" && s.trim() !== "";

/**
 * course: parsed course.json; lessons: [{ folder, challenges }] in course order.
 * Returns { tier, errors, warnings, counts }.
 */
export function checkCourse(course, lessons) {
    const errors = [];
    const warnings = [];
    const tier = TIER_BY_LEVEL[course.level];
    if (!tier) return { tier, errors: [`unknown level "${course.level}"`], warnings, counts: null };
    const need = TIERS[tier];

    // Metadata (V1.3 §11.1). publishStatus and language cover status and sandbox runtime.
    if (!DOMAINS.includes(course.domain)) errors.push(`"domain" must be one of ${DOMAINS.join(", ")}`);
    const outcomes = Array.isArray(course.learningOutcomes) ? course.learningOutcomes : [];
    if (outcomes.length < 4 || outcomes.length > 6) errors.push(`"learningOutcomes" needs 4-6 entries (has ${outcomes.length})`);
    if (outcomes.some((o) => !nonEmpty(o?.code) || !nonEmpty(o?.text))) errors.push(`every learning outcome needs "code" and "text"`);
    if (new Set(outcomes.map((o) => o?.code)).size !== outcomes.length) errors.push(`learning outcome codes must be unique`);
    const versions = course.testedVersions;
    if (!versions || typeof versions !== "object" || Array.isArray(versions) || !Object.keys(versions).length
        || !Object.values(versions).every(nonEmpty)) {
        errors.push(`"testedVersions" must be a non-empty { "<technology>": "<version>" } object`);
    }
    const reviewed = /^\d{4}-\d{2}-\d{2}$/.test(course.lastReviewedAt ?? "") ? new Date(`${course.lastReviewedAt}T00:00:00Z`) : null;
    if (!reviewed || Number.isNaN(reviewed.getTime()) || reviewed > new Date()) errors.push(`"lastReviewedAt" must be a past YYYY-MM-DD date`);
    const links = course.sourceLinks;
    if (!Array.isArray(links) || !links.length || !links.every((l) => /^https:\/\/\S+$/.test(l))) {
        errors.push(`"sourceLinks" needs at least one https URL`);
    }
    if (!nonEmpty(course.owner)) errors.push(`"owner" is required`);
    if (!Array.isArray(course.knownIssues)) errors.push(`"knownIssues" must be a list (empty when there are none)`);
    if (course.completionRules === undefined || course.completionRules === null) {
        errors.push(`"completionRules" must be set ({} = the tier's pass rates)`);
    }

    // Counts per tier.
    const challenges = lessons.flatMap((l) => l.challenges.map((c) => ({ ...c, folder: l.folder })));
    const statements = challenges.filter((c) => c.type === "quiz").flatMap((c) => c.questions.map((q) => ({ ...q, challenge: c.publicId })));
    const trueFalse = statements.filter(isTrueFalse);
    const coding = challenges.filter((c) => c.type !== "quiz");
    const byBucket = {};
    for (const c of coding) byBucket[`${c.type}.${c.difficulty}`] = (byBucket[`${c.type}.${c.difficulty}`] || 0) + 1;

    if (lessons.length < need.lessons) errors.push(`tier ${tier} needs ${need.lessons} lessons (has ${lessons.length})`);
    // A question bank (displayCount) only counts the statements a learner is shown.
    const shown = challenges.filter((c) => c.type === "quiz")
        .reduce((sum, c) => sum + Math.min(c.displayCount ?? Infinity, c.questions.filter(isTrueFalse).length), 0);
    if (shown < need.trueFalse) errors.push(`tier ${tier} needs ${need.trueFalse} True/False statements shown to a learner (has ${shown})`);
    for (const [type, levels] of Object.entries(need.coding)) {
        for (const [difficulty, min] of Object.entries(levels)) {
            const has = byBucket[`${type}.${difficulty}`] || 0;
            if (has < min) errors.push(`tier ${tier} needs ${min} ${difficulty} ${type} challenges (has ${has})`);
        }
    }
    for (const q of statements.filter((s) => !isTrueFalse(s))) {
        warnings.push(`${q.challenge}: a statement is not True/False (options "True", "False", one correct)`);
    }
    for (const q of trueFalse.filter((s) => !nonEmpty(s.explanation))) errors.push(`${q.challenge}: a True/False statement has no explanation`);
    const falseShare = trueFalse.length ? trueFalse.filter((q) => q.options[1].correct).length / trueFalse.length : 0;
    if (trueFalse.length && (falseShare < 0.4 || falseShare > 0.6)) {
        errors.push(`${Math.round(falseShare * 100)}% of the True/False statements are False (needs 40-60%)`);
    }

    // Scenario: >= 5 statements on one evidence pack + a fix-bug that reproduces the incident.
    const byId = new Map(challenges.map((c) => [c.publicId, c]));
    const scenario = course.scenario;
    if (!scenario || !nonEmpty(scenario.title)) {
        errors.push(`"scenario" needs { title, quiz, fixBug }`);
    } else {
        const quiz = byId.get(scenario.quiz);
        if (quiz?.type !== "quiz") errors.push(`scenario.quiz "${scenario.quiz}" is not a quiz challenge of this course`);
        else if (quiz.questions.filter(isTrueFalse).length < 5) errors.push(`scenario quiz ${quiz.publicId} needs at least 5 True/False statements`);
        else if (quiz.displayCount != null) errors.push(`scenario quiz ${quiz.publicId} must not use "displayCount": its statements follow the evidence in order`);
        if (byId.get(scenario.fixBug)?.type !== "fix_bug") errors.push(`scenario.fixBug "${scenario.fixBug}" is not a fix_bug challenge of this course`);
    }
    if (!coding.some((c) => c.type === "fix_bug" && /^Spot the AI Mistake/i.test(c.title ?? ""))) {
        errors.push(`no fix_bug challenge titled "Spot the AI Mistake: ..."`);
    }

    // Every coding challenge: 3 static hints, public and hidden tests.
    for (const c of coding) {
        if (!Array.isArray(c.hints) || c.hints.length !== 3) errors.push(`${c.publicId}: needs 3 hints (has ${c.hints?.length ?? 0})`);
        if (!c.tests?.some((t) => !t.hidden)) errors.push(`${c.publicId}: needs at least one public test`);
        if (!c.tests?.some((t) => t.hidden)) errors.push(`${c.publicId}: needs at least one hidden test`);
    }

    // Every outcome is checked by at least one quiz and one coding challenge.
    const codes = new Set(outcomes.map((o) => o?.code));
    for (const c of challenges) {
        if (!Array.isArray(c.outcomes) || !c.outcomes.length) warnings.push(`${c.publicId}: no "outcomes"`);
        for (const code of c.outcomes ?? []) if (!codes.has(code)) errors.push(`${c.publicId}: unknown outcome "${code}"`);
    }
    for (const code of codes) {
        const tagged = challenges.filter((c) => c.outcomes?.includes(code));
        if (!tagged.some((c) => c.type === "quiz")) errors.push(`outcome "${code}" has no quiz challenge`);
        if (!tagged.some((c) => c.type !== "quiz")) errors.push(`outcome "${code}" has no coding challenge`);
    }

    return {
        tier, errors, warnings,
        counts: { lessons: lessons.length, trueFalse: trueFalse.length, falsePercent: Math.round(falseShare * 100), coding: byBucket },
    };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const courseDir = path.resolve(process.argv[2] || ".");
    const course = JSON.parse(fs.readFileSync(path.join(courseDir, "course.json"), "utf8"));
    const lessons = (course.modules || []).flatMap((m) => m.lessons).map((l) => ({
        folder: l.folder,
        challenges: JSON.parse(fs.readFileSync(path.join(courseDir, l.folder, "challenges.json"), "utf8")).challenges,
    }));
    const { tier, errors, warnings, counts } = checkCourse(course, lessons);
    console.log(`${course.publicId} (${course.level}, tier ${tier})`);
    if (counts) console.log(`  ${counts.lessons} lessons, ${counts.trueFalse} True/False (${counts.falsePercent}% False), coding ${JSON.stringify(counts.coding)}`);
    for (const w of warnings) console.log(`  warn  ${w}`);
    for (const e of errors) console.log(`  ERROR ${e}`);
    console.log(errors.length ? `\n${errors.length} error(s).` : "\nDefinition of Done checks passed.");
    process.exitCode = errors.length ? 1 : 0;
}
