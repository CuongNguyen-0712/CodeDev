# Course content

Source of truth for courses built with the content pipeline. Each course lives in
`courses/<course public_id>/`, one folder per lesson.

| Where it ends up | What | Why there |
|---|---|---|
| Sanity (`lesson` documents) | Lesson narrative, diagrams (Cloudinary URLs), `challengeEmbed` blocks | Production and staging lesson store |
| Local Payload CMS (`lessons`) | The same lesson documents, from `lesson.payload.json` | Local development lesson store (docs/payload-cms.md) |
| Postgres `challenge.*` | Quiz options with `is_correct`, test cases, coding configs | Answers stay server-side |
| Object storage, public bucket | `challenges/<language>/<id>/starter.<ext>` (+ `harness.js` for javascript), lesson starter zips | Loaded by the editor and the browser sandbox |
| Cloudinary (production) / local Payload `media` | `diagrams/*.svg` rendered as PNG, covers, lesson videos | Media delivery; Cloudinary only in production, local Payload elsewhere |

## Layout

```
courses/<course>/
  course.json                    course, modules and lessons (lesson.sanityId = Sanity _id)
  cover.svg                      course cover, 1600x900 (16:9); upload-media.mjs writes its URL to course.json "image" (course.local.json locally)
  <NN-lesson>/
    lesson.source.mjs            narrative (helpers: h2, p, code, callout, image, challenge ...)
    challenges.json              challenges, quiz questions, coding config and tests
    challenges/<id>/             solution.<ext> (with @piece blocks), starter.<ext> + pieces.json (written by build-pieces.mjs,
                                 commit them), distractors/*.<ext> (wrong pieces), variants/*.<ext> (known-wrong answers),
                                 harness.js (javascript and config files)
    diagrams/*.svg               lesson diagrams
    starter-template/            optional local lab (zipped and uploaded)
    videos/*.mp4|webm            optional lesson videos (Git LFS, max 200 MB)
    assets.json                  written by upload-media.mjs in production (commit it)
    assets.local.json            written by upload-media.mjs elsewhere, local Payload (git-ignored)
    storage-manifest.json        written by upload-storage.mjs (commit it)
    lesson.sanity.json           written by build-lesson.mjs (git-ignored)
    lesson.payload.json          written by build-lesson.mjs --target payload (git-ignored)
  course.local.json              written by upload-media.mjs course outside production (git-ignored)
```

A course created before this pipeline sets `"existing": true` in `course.json` (only the
fields in `update` are written) and `"existing": true` on each old lesson, which the seed
leaves untouched.

Catalog metadata in `course.json` (onboarding recommendations, filters, admin): `careerRoles`, `industries`,
`goals` (codes from `catalog.career_role` / `catalog.industry` / `catalog.learning_goal`), `skills`
(`{ "<catalog.skill code>": weight 1-5 }`), `prerequisites` (course public ids) and `completionRules`
(`{}` = pass rates by level: 60/70/75/80% of quizzes and of coding challenges, 1 hard coding challenge from
advanced up; override with `minQuizPercent`, `minCodingPercent`, `minHardPassed`; `null` or absent on a new
course = finishing every lesson is enough) and `recommendedLevel` (`{ "min": 6, "max": 12 }`, either bound
optional: overrides the suggested User Level range of the course level; `null` clears it). Each field present
replaces that link table for the course; a missing field keeps what the admin set; an unknown code aborts
the seed.

Courses of the V1.3 architecture track also carry the content metadata of the Definition of Done (files only,
not seeded): `domain`, `learningOutcomes` (`[{ "code", "text" }]`, 4-6), `testedVersions`, `lastReviewedAt`,
`sourceLinks`, `owner`, `knownIssues` and `scenario` (`{ title, quiz, fixBug }` public ids); each challenge in
`challenges.json` lists the outcome codes it checks in `outcomes`. `tools/verify-course.mjs <course>` checks
them together with the counts of the course's tier (lessons, True/False statements, solve/fix-bug per
difficulty), 40-60% False statements, the scenario, outcome coverage, 3 hints and public + hidden tests per
coding challenge and a "Spot the AI Mistake" fix-bug (docs/master-plan-v1.3-adaptation.md P5).

A course that is only planned has `"modules": []` and an `outline` (modules, lesson titles, planned
challenges): the seed writes its catalog row and metadata only, and it stays `draft` until its lessons
are written and moved into `modules`.

## Pipeline

```bash
node content/tools/build-course.mjs content/courses/<course>          # every lesson: verify, upload, build, then the seed
node content/tools/build-course.mjs content/courses/<course> --push   # also write the Sanity drafts
```

Course cover: `node content/tools/upload-media.mjs course content/courses/<course>` renders `cover.svg` to PNG
and uploads it: production (`APP_ENV` of `--env`) to Cloudinary (`codedev/production/courses/<course>/cover`),
setting `image` and `imageChecksum` in `course.json` (`update.image` for an `existing` course); anywhere else to
the local Payload CMS, writing the git-ignored `course.local.json`. Rebuild the seed afterwards; covers are 16:9, logos and other
shapes are shown whole (`lib/coverFit.js`).

V1.3 track courses: run `node content/tools/verify-course.mjs content/courses/<course>` first (no network).

Step by step, per lesson (`tools/`):

1. `build-pieces.mjs <lesson>`: writes `starter.<ext>` and `pieces.json` of piece-assembly challenges.
   `verify-challenges.mjs <lesson>`: starter fails, solution passes every test, variants fail (pieces: the
   generated files are current, base + pieces passes, each distractor in place of its piece fails).
2. `upload-media.mjs lesson <lesson>`: Cloudinary (production) writes `assets.json`; local Payload writes `assets.local.json`.
3. `upload-storage.mjs <lesson> [--env .env.production]`: object storage, writes `storage-manifest.json`.
4. `build-lesson.mjs <lesson> [--target payload]`: writes `lesson.sanity.json` (or `lesson.payload.json` from `assets.local.json`).
5. `build-seed.mjs <course>`: writes `db/seeds/<course>.sql` (idempotent; also gives learners who
   enrolled earlier the history rows for new lessons).
6. `push-lesson.mjs <lesson> --env .env.production`: writes the Sanity draft; publish it in the Studio
   (`/studio`). It refuses an env file that is not production or staging.

Roadmaps: `content/roadmaps.json` (one roadmap per career role, ordered nodes, linked course public ids) ->
`node content/tools/build-roadmaps.mjs` -> `db/seeds/roadmaps.sql`. Apply it after the course seeds; draft courses
stay off roadmap pages until they are published.

Local development reads lesson bodies from the local Payload CMS only, production and staging from Sanity
only (docs/payload-cms.md): `npm run cms:up`, then `npm run cms:sync` loads every course, or
`build-course.mjs <course> --payload` one course.

Apply a seed: `node content/tools/apply-seed.mjs db/seeds/<course>.sql [--env .env.production --yes]` (non-local
targets need `--yes`). `build-course.mjs <course> --push --publish` writes published Sanity lesson documents (production; the env
file comes from `--push-env`, default `.env.production`).

Production: upload storage first (`build-course.mjs <course> --storage-only --storage-env .env.production`),
then apply `db/seeds/<course>.sql` (test it on a Neon branch first).

## Rules for challenges

- Languages and file extensions: `tools/languages.mjs` (javascript, python, c, cpp, java, go, rust, php,
  typescript, kotlin, csharp, plus the config languages dockerfile, nginx, yaml and hcl for Terraform). TypeScript is type-checked with `tsc --strict`; Kotlin can use kotlinx.coroutines;
  C# gets implicit usings (System, Collections.Generic, IO, Linq, Text, Threading.Tasks) and top-level statements.
  Every language except javascript is a `stdio` challenge that only runs in the code runner
  (`npm run services:up`, `CODE_RUNNER_URL`/`CODE_RUNNER_TOKEN` in `.env.local`; verify-challenges uses it too):
  - the starter reads one test case from stdin (a string as is, anything else as JSON) and prints the
    result; keep the small runner at the bottom of the file and let the learner write the function;
  - `expected` is the JSON value of stdout (text otherwise); line endings, trailing whitespace and JSON
    spacing are ignored (`lib/challenges/compare.js` `stdoutMatches`);
  - standard library only, no network, deterministic; Java uses `public class Main`; C is `-std=c23`,
    C++ `-std=c++23`, Rust edition 2024.
- Hints: `"hints": ["...", "...", "..."]` on a challenge, at most 3 (1 a guiding question, 2 where to look,
  3 a similar worked example), never the solution. They go to `challenge.challenge_hints` (server-only) and
  open one level at a time; opening level 3 before the first pass halves the challenge EXP. A challenge
  with `hints` ignores the hint argument of `challenge(id, hint)` in `lesson.source.mjs`.
- Question bank: `"displayCount": N` on a quiz shows each learner N of its questions (a fixed subset in a fixed
  shuffled order per learner, graded on that subset; migration `20261026_002`). Leave it out on scenario quizzes,
  whose statements follow the evidence in order. verify-course counts only the statements shown.
- Catalog direction (2026-11): a course applies a current framework or engine (Docker, Nginx, Kubernetes,
  CI, Postgres, Redis, Kafka, Next.js, ...) to a real production situation. New courses set
  `"template": "core-first"` in `course.json`: each lesson teaches only the core it uses (Situation, The core
  you need, Apply it in the project, Verify, Pitfalls), then its challenges (PROMPT_CONTEXT.md O2).
- Every lesson has 1-2 published challenges; `tools/verify-course.mjs` refuses 0 or more than 2 (a warning
  for `existing` courses). `"published": false` on a challenge keeps it in the files but out of the lesson
  (`is_published = false`); the two courses written before the limit use it for their extra challenges.
- Quiz evidence goes in a fenced block (```` ```sql ````, `text` for logs and tables) and identifiers in
  backticks: the quiz renders fences as code blocks (`lib/challenges/quizText.js`). Older plain-text
  evidence before `Statement:` still keeps its line breaks.
- Pieces (every coding challenge of a `core-first` course): the learner assembles the solution instead of
  typing it. Mark 3+ blocks of `solution.<ext>` with whole-line `// @piece <id>: <label>` ... `// @end`
  (`#` for python, dockerfile, nginx, yaml, hcl); `build-pieces.mjs` cuts them out, leaving one `// [ ] <label>`
  placeholder each, and writes `starter.<ext>` (the base) and `pieces.json`. Ids are kebab-case, labels are
  unique, 1-60 characters and say what belongs there without giving the code away; no nesting; a piece does
  not start or end with a blank line; a javascript entry function stays outside the pieces. Add 1-3
  distractors (`distractors/<id>.<ext>`, first line `@piece <real id>: <same label>`, then a common wrong
  version); at most 12 pieces in all. The list is shuffled per learner and never says which pieces are wrong.
  The learner puts the caret on a line and clicks a piece (a `[ ]` line is replaced; with no caret yet the
  piece goes to the start of the function body), or drags it onto a line on desktop, and
  ticks the ones used. Stored in `challenge.coding_configs.snippets` (migration `20261104_019`); the
  definition is cached 10 min. Older hand-written `coding.snippets` lists still work for existing courses.
- Fix-bug pieces (`type: "fix_bug"` with `bugs/`): the marked blocks of `solution.<ext>` are the fixes, and
  `bugs/<piece id>.<ext>` (same first line as a distractor) holds the faulty code of each block. The starter is
  then the faulty program itself, no `[ ]` lines: the learner finds the faulty lines, selects them and clicks
  (or drops) the fix, which replaces the whole selected lines. Every block needs its bug; distractors are
  plausible wrong fixes. Text outside the pieces is what the learner reads, so it describes the symptom, not
  the fix. verify-challenges also checks that each bug, left alone with every other block fixed, fails.
- verify-challenges rejects a distractor (or a "bug left") whose only failures are build errors, undefined
  names or timeouts: a wrong piece must be caught by what it does, or the compiler gives it away (for a "bug
  left" of dependent fix blocks this is only a note). A starter whose tests time out is rejected too.
- Config-file challenges: `coding.language` `dockerfile`, `nginx` or `yaml` (`starter.Dockerfile`,
  `starter.conf`, `starter.yml`). They run like javascript: the file text becomes the global `__source` and
  `harness.js` parses and simulates it (no entry function, no real Docker or Nginx).
- New courses: 1-2 challenges per lesson. Premium courses set `accessModel`, `offers` and usually
  `publishStatus: "draft"` in `course.json` (docs/course-catalog-plan.md).
- javascript (and config) challenges run in a Web Worker: no DOM, no Node-only APIs, no imports. The entry is the
  first function in `starter.js`; `harness.js` defines `async function __harness(input, ctx)`.
- Deterministic harnesses (fake clocks, injected timers), well under `timeLimitMs`.
- Never put quiz answers, test expectations or solutions in `lesson.source.mjs`.

AI-assisted authoring: paste `PROMPT_CONTEXT.md` (context pack, rules and output formats for these files) as
the context, then fill its request block.
