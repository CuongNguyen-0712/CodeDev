# Course content

Source of truth for courses built with the content pipeline. Each course lives in
`courses/<course public_id>/`, one folder per lesson.

| Where it ends up | What | Why there |
|---|---|---|
| Sanity (`lesson` documents) | Lesson narrative, diagrams (Cloudinary URLs), `challengeEmbed` blocks | Read by the browser |
| Postgres `challenge.*` | Quiz options with `is_correct`, test cases, coding configs | Answers stay server-side |
| Object storage, public bucket | `challenges/javascript/<id>/{starter,harness}.js`, lesson starter zips | Loaded by the browser sandbox |
| Cloudinary | `diagrams/*.svg` rendered as PNG | Image delivery |

## Layout

```
courses/<course>/
  course.json                    course, modules and lessons (lesson.sanityId = Sanity _id)
  <NN-lesson>/
    lesson.source.mjs            narrative (helpers: h2, p, code, callout, image, challenge ...)
    challenges.json              challenges, quiz questions, coding config and tests
    challenges/<id>/             starter.js, harness.js, solution.js, variants/*.js (known-wrong answers)
    diagrams/*.svg               lesson diagrams
    starter-template/            optional local lab (zipped and uploaded)
    assets.json                  written by upload-images.mjs (commit it)
    storage-manifest.json        written by upload-storage.mjs (commit it)
    lesson.sanity.json           written by build-lesson.mjs (git-ignored)
```

A course created before this pipeline sets `"existing": true` in `course.json` (only the
fields in `update` are written) and `"existing": true` on each old lesson, which the seed
leaves untouched.

## Pipeline

```bash
node content/tools/build-course.mjs content/courses/<course>          # every lesson: verify, upload, build, then the seed
node content/tools/build-course.mjs content/courses/<course> --push   # also write the Sanity drafts
```

Step by step, per lesson (`tools/`):

1. `verify-challenges.mjs <lesson>`: starter fails, solution passes every test, variants fail.
2. `upload-images.mjs <lesson>`: Cloudinary, writes `assets.json`.
3. `upload-storage.mjs <lesson> [--env .env.production]`: object storage, writes `storage-manifest.json`.
4. `build-lesson.mjs <lesson>`: writes `lesson.sanity.json`.
5. `build-seed.mjs <course>`: writes `db/seeds/<course>.sql` (idempotent; also gives learners who
   enrolled earlier the history rows for new lessons).
6. `push-lesson.mjs <lesson>`: writes the Sanity draft; publish it in the Studio (`/studio`).

Production: upload storage first (`build-course.mjs <course> --storage-only --storage-env .env.production`),
then apply `db/seeds/<course>.sql` (test it on a Neon branch first).

## Rules for challenges

- JavaScript only, runnable in a Web Worker: no DOM, no Node-only APIs, no imports. The entry is the
  first function in `starter.js`; `harness.js` defines `async function __harness(input, ctx)`.
- Deterministic harnesses (fake clocks, injected timers), well under `timeLimitMs`.
- Never put quiz answers, test expectations or solutions in `lesson.source.mjs`.
