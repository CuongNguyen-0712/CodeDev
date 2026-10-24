# Database

PostgreSQL (Neon in production, PostgreSQL locally). The app talks to it through the
query modules in this folder (`*.db.js`, `roadmap.js`) via `lib/db.js`.

| Folder / file | Contents |
|---|---|
| `schema.sql` | Baseline for a new database: full schema + reference data at `20261023_002` (replaces the migrations up to `20261019_001`, still in git history) |
| `migrations/` | Ordered SQL migrations. **The only way to change the schema.** |
| `functions/` | One file per SQL function (generated) |
| `procedures/` | One file per stored procedure (generated; none at the moment) |
| `views/` | One file per view (generated) |
| `triggers/` | One file per trigger (generated) |
| `schema.dbml` | Full diagram for [dbdiagram.io](https://dbdiagram.io) (generated) |
| `tools/migrate.mjs` | Applies pending migrations and records them in `public.schema_migrations` |
| `tools/compare-schema.mjs` | Read-only drift check between two databases (local vs production) |
| `tools/export-schema.mjs` | Regenerates the generated folders/files from a live database |
| `seeds/` | Course content seeds (generated from `content/courses/`, see [content/README.md](../content/README.md)) |
| `backups/` | Local `pg_dump` files (git-ignored) |

## Schemas

| Schema | Tables |
|---|---|
| `identity` | users, accounts, sessions, refresh_tokens, auth_outbox, roles, permissions, user_roles, role_permissions, audit_log (append-only admin log) |
| `profile` | info (`avatar_asset_id` -> `storage.assets`, `points` = cache of the points ledger, `exp` / `exp_level` = cache of the EXP ledger), point_transaction (append-only points ledger), exp_transaction (append-only EXP ledger), exp_rule (EXP per activity), exp_level (the 20 level thresholds), onboarding, learning_preference, user_industry, user_learning_goal, notification, task, views `point_balance_drift`, `exp_drift` |
| `catalog` | course (`publish_status`, `access_model`, `course_type`), category, language, career_role, industry, learning_goal, skill, career_role_skill, course_skill, course_career_role, course_industry, course_learning_goal, course_prerequisite |
| `course` | module, lesson |
| `learning` | register, history, favorite, recovery, view `user_progress` |
| `challenge` | challenges, questions, question_options, question_submissions, coding_* , code_*, challenge_test_cases, challenge_hints (levels 1-3, server-only), hint_views (opened hints; level 3 before the first pass halves the challenge EXP) |
| `roadmap` | roadmaps, nodes, node_course, roadmap_users, user_progress |
| `community` | comment, voting, event, event_join, feedback, team, team_members, friend, messages |
| `commerce` | offer (prices), orders, order_items, payment, payment_event (webhook inbox), entitlement (course access), cart_items |
| `storage` | assets: every stored file, S3 objects and Cloudinary images |
| `public` | shared enum types, the API functions called by the app, `schema_migrations` |

### storage.assets

One row per stored object, unique on `(provider, object_key)`.

| Provider | `object_key` | `external_url` | Written by |
|---|---|---|---|
| `s3` | object key in `S3_BUCKET` / `S3_PRIVATE_BUCKET` | NULL (read through the API) | challenge seeding, code submissions |
| `cloudinary` | Cloudinary `public_id` (`codedev/<APP_ENV>/users/<user>/avatars/<ulid>`) | `secure_url` | `media.db.js` → `setAvatar` |

`owner_id` (uploading user), `purpose` (`avatar`, ...), `width` / `height` / `format` /
`version`, `checksum` (SHA-256 of the uploaded bytes) and `deleted_at` (file replaced or removed)
describe the file. `mine_type` holds the MIME type; the misspelled name is kept for compatibility.
`profile.info.image` is the URL shown for a user: an uploaded avatar (then `avatar_asset_id` is
set) or an OAuth provider picture (no asset).

## SQL functions called by the app

| Function | Called from |
|---|---|
| `sign_up(7)` | `user.db.js` → `signUp` |
| `log_in(1)` | `user.db.js` → `login` |
| `sign_in_with_provider(9)` | `user.db.js` → `signInWithProvider`: OAuth sign-in decision (`login` / `created` / `link_required` / `confirm_required` / `blocked`; never links by email itself since `20261024_001`), see `docs/auth.md` |
| `link_provider_account(4)` | `user.db.js` → `linkProviderAccount`: explicit link after a password sign-in (`CD409` when the provider account belongs to another user) |
| `auth_with_provider(7)` | no longer called (links by email without checking verification); kept for the app version running during the deploy of migration `20261023_001`, drop it afterwards |
| `create_session(6)` | no longer called: sessions and refresh tokens are written by `session.db.js` (see `docs/auth.md`); kept for compatibility |
| `learning_progress(2)` | `user.db.js` → `getLearningProgress` (entitlement check, then `learning_progress_content`) |
| `register_course(2)` | `course.db.js` → `postRegister` (grants the `free` entitlement of a free course; premium needs one) |
| `learning_lesson(2)` | `course.db.js` → `getLearning` (`assert_lesson_access`) |
| `submit_lesson(3)` | `course.db.js` → `postSubmitLesson` (`assert_lesson_access`; lesson points via `post_points`, lesson EXP and the course completion bonus as EXP via `award_exp`; returns what was awarded). Completing a course credits no points. |
| `has_course_access(2)` | `course.db.js`, `challenge.db.js`, `commerce.db.js`: the single course access rule (active entitlement) |
| `post_points(10)` | the only writer of points: `submit_lesson`, `challenge.db.js`, `redeem_course_points`, `admin.db.js` |
| `post_exp(9)` | the only writer of EXP (one award per source / idempotency key, never below 0, recomputes `exp_level`): `award_exp`, `admin.db.js` → `postExp` |
| `award_exp(6)`, `award_challenge_exp(4)` | EXP of an active `exp_rule` (`lesson`, `quiz.<difficulty>`, `coding.<type>.<difficulty>`, `course.<level>`): `submit_lesson`, `challenge.db.js` → `awardChallengeRewards` |
| `level_for_exp(1)` | level of an EXP total (`profile.exp_level`) |
| `ranking_scores(1)` | `ranking.db.js`: per-user EXP, earned points, first-try accuracy and overall score from the ledgers (all time, or since a time); tiers in `profile.rank_tier` |
| `redeem_course_points(3)` | `commerce.db.js` → `redeem` (order + debit + entitlement in one transaction) |
| `create_money_order(5)` | `commerce.db.js` → `createMoneyOrder` |
| `apply_payment_event(8)` | `commerce.db.js` → `applyPaymentEvent` (verified webhooks; idempotent per event id) |

Business errors of these functions use SQLSTATE class `CD` (`CD402` not enough points, `CD403` no
access, `CD404` not available, `CD409` already owned, `CD410` no price, `CD422` request key reused),
mapped to HTTP statuses in `lib/error/apiError.js`. Design: `docs/premium-onboarding-design.md`.
| `voting_comment(3)` | `course.db.js` → `postVotingComment` |
| `default_role_id()` | used inside `sign_up` / `auth_with_provider` |
| `lesson_module_change()`, `lesson_course_change()` | trigger functions keeping `course.module.lessons` and `catalog.course.modules/lessons` in sync |
| `identity.sessions_sync_columns()`, `identity.refresh_tokens_sync_columns()` | trigger functions keeping the legacy session / token columns in sync (migration `20261016_001`) |

## Changing the schema

Local and production must stay identical. `public.schema_migrations` records which migration
files each database has run (version, SHA-256 of the file, time, who).

1. Add `migrations/<YYYYMMDD>_<NNN>_<name>.sql`, wrapped in `BEGIN; … COMMIT;`. Prefer
   expand-only changes (add columns / tables / indexes) so the deployed app keeps working.
2. Apply it locally and test:

   ```bash
   npm run db:migrate
   ```

3. Test it on a Neon branch of production (Neon console or MCP: create a branch from
   `production`), then run the integration tests against it:

   ```bash
   DATABASE_URL="<branch url>" node db/tools/migrate.mjs --yes
   DATABASE_URL="<branch url>" npx vitest run __tests__/auth __tests__/lists __tests__/media
   ```

4. Apply it to production (prints the pending list first; non-local targets need `--yes`):

   ```bash
   npm run db:migrate:prod -- --dry-run
   npm run db:migrate:prod -- --yes
   ```

5. Check that both databases match and regenerate the exported objects and the diagram:

   ```bash
   npm run db:compare   # exit 1 on any difference
   npm run db:export
   ```

`db:compare` compares applied migrations, columns, functions, procedures, views, triggers,
indexes, constraints and enums. It ignores what only the server version changes (production is
PostgreSQL 16, local 18: same CHECK / partial index printed differently, NOT NULL constraints
listed in `pg_constraint` by 18 only).

A database migrated by hand before the runner existed is marked with
`node db/tools/migrate.mjs --baseline <last applied version>` (both databases were baselined on
2026-10-17: production at `20261015_002`, local at `20261016_001`).

New database (another machine, CI): load the baseline, then run the newer migrations and the seeds.
`schema.sql` carries its `schema_migrations` rows, so the runner skips what it already contains:

```bash
createdb codedev
psql -d codedev -v ON_ERROR_STOP=1 -f db/schema.sql
npm run db:migrate
```

Migrations applied on local and production were squashed into `schema.sql` on 2026-10-23; the
runner ignores recorded versions without a file. Squash again the same way (pg_dump of the
migrated local database, schema + reference tables) only once every migration it replaces has
reached production.

Identity columns: `storage.assets`, `community.comment`, `learning.favorite` use
`GENERATED ALWAYS AS IDENTITY` — never insert an explicit `id`. `identity.sessions`,
`identity.refresh_tokens` and `identity.users` take application-generated Sonyflake ids.
