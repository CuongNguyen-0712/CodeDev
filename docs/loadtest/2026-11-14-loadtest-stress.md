# Load test report: loadtest / stress

Run `20261114-0115-loadtest-stress`, commit `f8379d48`, 2026-11-13T18:15:39.225Z to 2026-11-13T18:24:23.825Z.

## Capacity (N)

**N = none**: the first stage already broke a threshold.
First break at stage 0 (50 VUs): read p95 10016 ms > 800.

Thresholds: read p95 < 800 ms, write p95 < 1500 ms, error rate < 1% (HTTP 429 is not an error). A stage passes only strictly below each limit; N is the highest stage where every stage up to it passes. Requests after the scheduled end (VUs finishing their last iteration) are dropped.
Only the hold window is measured: points in the first 10 s of each 120 s stage (the ramp) are ignored, so N is read at a steady VU level. Stage start = first tagged k6 point + stage x 120 s.

| stage | VUs | reads | read p95 ms | writes | write p95 ms | requests | error % | 429 |
|---|---|---|---|---|---|---|---|---|
| 0 | 50 | 983 | 10016 | 125 | 1407 | 1108 | 20.49 | 0 |
| 1 | 100 | 703 | 10432 | 78 | 799 | 781 | 25.48 | 0 |

Bottleneck endpoints at the break stage (50 VUs) (p95 over 2x the class threshold): /api/ranking (read, 30051 ms), /api/user/me (read, 10077 ms), /api/course/learning (read, 10069 ms), /api/friends (read, 10028 ms), /api/user/course-progress (read, 10024 ms), /api/ranking/me (read, 10017 ms), /api/friends/counts (read, 10016 ms), /api/user/learning-progress (read, 10015 ms), /api/course/rating (read, 10012 ms), /api/challenges/:id/quiz (read, 10009 ms), /api/chat/conversations (read, 10009 ms), /api/challenges/:id/workspace (read, 10008 ms), /api/course/comments (read, 10007 ms), /api/friends/invitations (read, 10005 ms), queueCodeRunAction (write, 4218 ms), sendMessageAction (write, 3993 ms).

Endpoint table below is for the break stage (no N).

## Run validity

**INVALID**: worst 1-minute mean host CPU of the load machine 88.6% (limit 80%). The load generator was saturated, so latencies may reflect it, not the app.
k6 container peak CPU: 1301.8% (informational; docker percent, 100 = one core).
k6 exit code: 99.

## Latency by endpoint

| endpoint | class | n | p50 ms | p95 ms | p99 ms |
|---|---|---|---|---|---|
| /api/ranking | read | 52 | 10015 | 30051 | 30071 |
| /api/user/me | read | 46 | 10005 | 10077 | 12451 |
| /api/course/learning | read | 52 | 92 | 10069 | 12560 |
| /api/friends | read | 8 | 10003 | 10028 | 10028 |
| /api/user/course-progress | read | 40 | 10002 | 10024 | 18800 |
| /api/ranking/me | read | 51 | 10005 | 10017 | 10113 |
| /api/friends/counts | read | 4 | 2006 | 10016 | 10016 |
| /api/user/learning-progress | read | 50 | 203 | 10015 | 10869 |
| /api/course/rating | read | 46 | 143 | 10012 | 10047 |
| /api/challenges/:id/quiz | read | 55 | 86 | 10009 | 10020 |
| /api/chat/conversations | read | 11 | 575 | 10009 | 10009 |
| /api/challenges/:id/workspace | read | 7 | 4576 | 10008 | 10008 |
| /api/course/comments | read | 45 | 100 | 10007 | 10021 |
| /api/friends/invitations | read | 10 | 2303 | 10005 | 10005 |
| queueCodeRunAction | write | 7 | 422 | 4218 | 4218 |
| sendMessageAction | write | 8 | 530 | 3993 | 3993 |
| submitQuizAction | write | 43 | 107 | 1407 | 1894 |
| registerCourseAction | write | 10 | 90 | 1207 | 1207 |
| /contact | read | 8 | 268 | 862 | 862 |
| sendFriendRequestAction | write | 9 | 89 | 860 | 860 |
| /api/chat/conversations/:id/messages | read | 8 | 18 | 796 | 796 |
| recordLessonVisitAction | write | 48 | 20 | 182 | 397 |
| /course | read | 43 | 28 | 80 | 175 |
| /learning/:id | read | 59 | 22 | 66 | 83 |
| /roadmap | read | 40 | 29 | 56 | 83 |
| /api/course/course-details | read | 46 | 4 | 45 | 10004 |
| /api/course/courses | read | 43 | 3 | 30 | 63 |
| /course/:id | read | 46 | 5 | 24 | 57 |
| /api/roadmap/list | read | 40 | 3 | 17 | 39 |
| /api/course/filters | read | 43 | 3 | 14 | 70 |
| /ranking | read | 52 | 5 | 13 | 25 |
| / | read | 27 | 5 | 13 | 13 |
| /learning | read | 40 | 5 | 12 | 20 |
| /messages | read | 11 | 4 | 11 | 11 |

## HTTP 429 by endpoint (measured window)

None.

## Top 10 queries (pg_stat_statements, by total time)

| query | calls | mean ms | total ms | rows |
|---|---|---|---|---|
| `WITH me AS ( SELECT u.id, u.public_id, u.username, i.nickname, i.image, i.show_on_leaderboard, ( u.status = $5 AND i.show_on_leaderboard AND NOT EXISTS ( SELECT $6 FROM identity.user_roles ur JOIN ide` | 1 | 28611.71 | 28612 | 1 |
| `WITH me AS ( SELECT u.id, u.public_id, u.username, i.nickname, i.image, i.show_on_leaderboard, ( u.status = $5 AND i.show_on_leaderboard AND NOT EXISTS ( SELECT $6 FROM identity.user_roles ur JOIN ide` | 1 | 25508.14 | 25508 | 1 |
| `select * from learning_progress($1, $2)` | 73 | 180.21 | 13155 | 73 |
| `SELECT public.refresh_ranking_snapshot() AS refreshed` | 1 | 2361.47 | 2361 | 1 |
| `select * from learning_lesson($1, $2)` | 62 | 32.87 | 2038 | 62 |
| `SELECT ch.id::text AS id, ch.public_id, ch.type, ch.title, ch.status, COALESCE(ch.points, $3) AS points, ch.quiz_display_count, ch.lesson_id::text AS lesson_id, u.id::text AS user_db_id, h.status AS l` | 133 | 13.69 | 1820 | 133 |
| `SELECT * FROM register_course($1, $2)` | 11 | 108.92 | 1198 | 11 |
| `INSERT INTO community.friend (sender_id, receiver_id, status) VALUES ($1, $2, $3) ON CONFLICT ((LEAST(sender_id, receiver_id)), (GREATEST(sender_id, receiver_id))) DO NOTHING` | 29 | 28.33 | 822 | 29 |
| `INSERT INTO challenge.code_runs (public_id, user_id, challenge_id, run_type, language, source_snapshot, status, sandbox, deadline_at) VALUES ($1, $2, $3::bigint, $4, $5, $6::jsonb, $9, $7, now() + mak` | 9 | 85.67 | 771 | 9 |
| `WITH u AS (SELECT id FROM identity.users WHERE public_id = $1), c AS (SELECT id FROM catalog.course WHERE public_id = $2), lesson AS ( UPDATE learning.history h SET last_seen = now() WHERE h.user_id =` | 109 | 5.12 | 558 | 109 |

## Resources (peaks over the whole run)

| metric | peak |
|---|---|
| app CPU % | 97.1 |
| app memory MB | 309 |
| database CPU % | 106.3 |
| database memory MB | 693 |
| database connections (active + idle) | 17 |
| locks waiting | 0 |
| outbox pending (largest queue) | 0 |
| code runs queued (all states) | 9 |
| dead letters open | 0 |

## Assumptions

- Environment `loadtest`, profile `stress`, Inngest `inline`, Prometheus remote-write off, max VUs 3000.
- Seed: 5000 users, 3000 pre-minted sessions (one per VU).
- Journey mix by request count: guest 33.0%, learner 53.7%, social 11.5%, coder 1.8%.
- Outcome per request comes from the client's `failed_requests` / `limited` metrics, not the HTTP status (server actions return 200 on failure).
