#!/usr/bin/env node
/**
 * Piece-assembly challenges (content/README.md "Pieces"): turns the marked solution of every
 * coding challenge of a lesson into what the learner gets.
 *
 *   challenges/<id>/solution.<ext>        complete solution with `@piece id: label` ... `@end` blocks
 *   challenges/<id>/distractors/*.<ext>   wrong pieces: first line `@piece <real piece id>: <same label>`
 *   -> challenges/<id>/starter.<ext>      base code: each block replaced by `[ ] <label>` (generated)
 *   -> challenges/<id>/pieces.json        real pieces in solution order, then distractors (generated)
 *
 * Both generated files are committed. A solution without markers is left alone (typed challenge).
 * verify-challenges.mjs regenerates them and fails when they are stale.
 *
 * Usage: node content/tools/build-pieces.mjs <lesson folder> [...]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { LANGUAGES, challengeLanguage } from "./languages.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const { commentToken, parseDistractor, parsePieces } = await import(pathToFileURL(path.join(root, "lib", "challenges", "pieces.js")).href);

export const MAX_PIECES = 12;
const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** True when the solution of this challenge folder uses @piece markers. */
export function usesPieces(dir, ext) {
    const file = path.join(dir, `solution.${ext}`);
    return fs.existsSync(file) && /@piece\s/.test(fs.readFileSync(file, "utf8"));
}

/**
 * Generated files of one challenge, without writing them.
 * Returns { base, pieces (as stored: [{id,label,code,distractor?}]), real ([{id,label,code}]),
 * distractors ([{ id, for, code }]), errors }.
 */
export function generatePieces(dir, language) {
    const { ext } = LANGUAGES[language];
    const token = commentToken(language);
    const solution = fs.readFileSync(path.join(dir, `solution.${ext}`), "utf8");
    const { base, pieces: parsed, errors } = parsePieces(solution, token);
    const real = parsed.map(({ id, label, code }) => ({ id, label, code }));
    const ids = new Set(real.map((p) => p.id));

    const distractors = [];
    const distractorDir = path.join(dir, "distractors");
    const files = fs.existsSync(distractorDir) ? fs.readdirSync(distractorDir).filter((f) => f.endsWith(`.${ext}`)).sort() : [];
    for (const file of files) {
        const id = file.slice(0, -(ext.length + 1));
        const d = parseDistractor(fs.readFileSync(path.join(distractorDir, file), "utf8"), token);
        const sibling = real.find((p) => p.id === d.for);
        if (d.error) errors.push(`distractors/${file}: ${d.error}`);
        else if (!sibling) errors.push(`distractors/${file}: no piece "${d.for}" in the solution`);
        else if (d.label !== sibling.label) errors.push(`distractors/${file}: label must be "${sibling.label}" (the piece it imitates)`);
        if (!ID_RE.test(id)) errors.push(`distractors/${file}: file name must be kebab-case (it is the piece id)`);
        if (ids.has(id)) errors.push(`distractors/${file}: id "${id}" is already used`);
        ids.add(id);
        if (!d.error && sibling) distractors.push({ id, for: d.for, label: d.label, code: d.code });
    }

    if (real.length < 2 && !errors.length) errors.push(`a piece challenge needs at least 2 pieces (has ${real.length})`);
    const pieces = [...real, ...distractors.map(({ id, label, code }) => ({ id, label, code, distractor: true }))];
    if (pieces.length > MAX_PIECES) errors.push(`at most ${MAX_PIECES} pieces including distractors (has ${pieces.length})`);
    return { base: base.endsWith("\n") || !solution.endsWith("\n") ? base : `${base}\n`, pieces, real, distractors, errors };
}

export const piecesJson = (pieces) => `${JSON.stringify(pieces, null, 2)}\n`;

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    let failures = 0;
    for (const lessonDir of process.argv.slice(2).map((a) => path.resolve(a))) {
        const { challenges } = JSON.parse(fs.readFileSync(path.join(lessonDir, "challenges.json"), "utf8"));
        for (const challenge of challenges.filter((c) => c.type !== "quiz")) {
            const language = challengeLanguage(challenge);
            const { ext } = LANGUAGES[language];
            const dir = path.join(lessonDir, "challenges", challenge.publicId);
            if (!usesPieces(dir, ext)) continue;
            if (challenge.coding?.snippets) {
                console.error(`${challenge.publicId}: remove coding.snippets from challenges.json (pieces come from the solution)`);
                failures++;
                continue;
            }
            const { base, pieces, real, distractors, errors } = generatePieces(dir, language);
            if (errors.length) {
                for (const e of errors) console.error(`${challenge.publicId}: ${e}`);
                failures++;
                continue;
            }
            fs.writeFileSync(path.join(dir, `starter.${ext}`), base);
            fs.writeFileSync(path.join(dir, "pieces.json"), piecesJson(pieces));
            console.log(`${challenge.publicId}: ${real.length} pieces, ${distractors.length} distractors`);
        }
    }
    process.exitCode = failures ? 1 : 0;
}
