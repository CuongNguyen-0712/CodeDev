# Database

PostgreSQL (Neon in production, PostgreSQL locally). The app talks to it through the
query modules in this folder (`*.db.js`, `roadmap.js`) via `lib/db.js`.

| Folder / file | Contents |
|---|---|
| `migrations/` | Ordered SQL migrations. **The only way to change the schema.** |
| `functions/` | One file per SQL function (generated) |
| `procedures/` | One file per stored procedure (generated; none at the moment) |
| `views/` | One file per view (generated) |
| `triggers/` | One file per trigger (generated) |
| `schema.dbml` | Full diagram for [dbdiagram.io](https://dbdiagram.io) (generated) |
| `tools/export-schema.mjs` | Regenerates the generated folders/files from a live database |
| `backups/` | Local `pg_dump` files (git-ignored) |

## Schemas

| Schema | Tables |
|---|---|
| `identity` | users, accounts, sessions, refresh_tokens, roles, permissions, user_roles, role_permissions |
| `profile` | info, point_transaction, notification, task |
| `catalog` | course, category, language |
| `course` | module, lesson |
| `learning` | register, history, favorite, recovery, view `user_progress` |
| `challenge` | challenges, questions, question_options, question_submissions, coding_* , code_*, challenge_test_cases |
| `roadmap` | roadmaps, nodes, node_course, roadmap_users, user_progress |
| `community` | comment, voting, event, event_join, feedback, team, team_members, friend, messages |
| `commerce` | cart_items, orders, order_items |
| `storage` | assets |
| `public` | shared enum types and the API functions called by the app |

## SQL functions called by the app

| Function | Called from |
|---|---|
| `sign_up(7)` | `user.db.js` → `signUp` |
| `log_in(1)` | `user.db.js` → `login` |
| `auth_with_provider(7)` | `user.db.js` → `signUpWithProvider` |
| `create_session(6)` | `user.db.js` → `createSession` (6th arg `_user_agent` may be NULL) |
| `learning_progress(2)` | `user.db.js` → `getLearningProgress` |
| `register_course(2)` | `course.db.js` → `postRegister` |
| `learning_lesson(2)` | `course.db.js` → `getLearning` |
| `submit_lesson(3)` | `course.db.js` → `postSubmitLesson` |
| `voting_comment(3)` | `course.db.js` → `postVotingComment` |
| `default_role_id()` | used inside `sign_up` / `auth_with_provider` |
| `lesson_module_change()`, `lesson_course_change()` | trigger functions keeping `course.module.lessons` and `catalog.course.modules/lessons` in sync |

## Changing the schema

1. Add `migrations/<YYYYMMDD>_<NNN>_<name>.sql` (wrap it in `BEGIN; … COMMIT;`).
2. Test it on a Neon branch of production, then apply it to production and local.
3. Regenerate the exported objects and the diagram:

   ```bash
   node db/tools/export-schema.mjs
   ```

Identity columns: `storage.assets`, `community.comment`, `learning.favorite` use
`GENERATED ALWAYS AS IDENTITY` — never insert an explicit `id`. `identity.sessions`,
`identity.refresh_tokens` and `identity.users` take application-generated Sonyflake ids.
