# Load test report: loadtest / stress

Run `20261114-1025-loadtest-stress`, commit `e85576e6`, 2026-11-14T03:25:48.582Z to 2026-11-14T03:34:51.088Z.

## Capacity (N)

**N = 200 concurrent VUs.**
No threshold broke before the run ended (the real limit is above the last stage; raise --max-vus).

Thresholds: read p95 < 800 ms, write p95 < 1500 ms, error rate < 1% (HTTP 429 is not an error). A stage passes only strictly below each limit; N is the highest stage where every stage up to it passes. Requests after the scheduled end (VUs finishing their last iteration) are dropped.
Only the hold window is measured: points in the first 10 s of each 120 s stage (the ramp) are ignored, so N is read at a steady VU level. Stage start = first tagged k6 point + stage x 120 s.

| stage | VUs | reads | read p95 ms | writes | write p95 ms | requests | error % | 429 |
|---|---|---|---|---|---|---|---|---|
| 0 | 50 | 2075 | 55 | 295 | 282 | 2370 | 0.00 | 0 |
| 1 | 100 | 3956 | 185 | 566 | 310 | 4522 | 0.00 | 0 |
| 2 | 150 | 5979 | 79 | 832 | 221 | 6811 | 0.00 | 0 |
| 3 | 200 | 7925 | 146 | 1078 | 348 | 9003 | 0.01 | 0 |

Bottleneck endpoints at N (200 VUs) (p95 over 2x the class threshold): none.

Endpoint table below is for N (200 VUs).

## Run validity

Valid: worst 1-minute mean host CPU of the load machine during the k6 test window (setup and VU initialisation excluded) 50.6% (limit 80%).
k6 container peak CPU: 64.8% (informational; docker percent, 100 = one core).
k6 exit code: 0.

## Latency by endpoint

| endpoint | class | n | p50 ms | p95 ms | p99 ms |
|---|---|---|---|---|---|
| /roadmap | read | 258 | 25 | 929 | 1665 |
| sendFriendRequestAction | write | 78 | 27 | 861 | 1257 |
| /contact | read | 132 | 34 | 820 | 2413 |
| sendMessageAction | write | 129 | 27 | 758 | 1372 |
| /learning/:id | read | 465 | 20 | 728 | 1702 |
| /messages | read | 134 | 4 | 628 | 1005 |
| queueCodeRunAction | write | 44 | 242 | 613 | 2438 |
| respondFriendRequestAction | write | 53 | 23 | 611 | 1182 |
| /course | read | 266 | 22 | 604 | 1278 |
| /course/:id | read | 259 | 4 | 405 | 858 |
| submitQuizAction | write | 252 | 29 | 401 | 517 |
| /ranking | read | 417 | 4 | 299 | 898 |
| /api/ranking/me | read | 418 | 26 | 292 | 496 |
| /api/user/me | read | 410 | 9 | 291 | 1048 |
| submitLessonAction | write | 63 | 20 | 287 | 776 |
| /api/challenges/:id/quiz | read | 420 | 11 | 231 | 1102 |
| /api/ranking | read | 417 | 19 | 218 | 460 |
| /api/user/learning-progress | read | 426 | 15 | 188 | 458 |
| /api/challenges/:id/workspace | read | 40 | 16 | 152 | 328 |
| /api/chat/conversations/:id/messages | read | 134 | 10 | 136 | 215 |
| /api/chat/conversations | read | 134 | 12 | 131 | 200 |
| /api/user/course-progress | read | 411 | 8 | 125 | 183 |
| registerCourseAction | write | 33 | 13 | 113 | 126 |
| /api/course/learning | read | 426 | 13 | 112 | 192 |
| /api/friends | read | 132 | 8 | 103 | 183 |
| recordLessonVisitAction | write | 426 | 10 | 94 | 189 |
| /api/course/comments | read | 259 | 6 | 94 | 124 |
| /api/friends/invitations | read | 265 | 7 | 93 | 107 |
| /api/course/rating | read | 258 | 7 | 91 | 145 |
| /api/friends/counts | read | 133 | 6 | 71 | 100 |
| / | read | 255 | 4 | 56 | 880 |
| /api/course/course-details | read | 258 | 5 | 53 | 250 |
| /learning | read | 410 | 4 | 39 | 63 |
| /api/roadmap/list | read | 257 | 3 | 34 | 78 |
| /api/course/courses | read | 266 | 4 | 31 | 77 |
| /api/course/filters | read | 265 | 3 | 21 | 53 |

## HTTP 429 by endpoint (measured window)

None.

## Top 10 queries (pg_stat_statements, by total time)

| query | calls | mean ms | total ms | rows |
|---|---|---|---|---|
| `WITH me AS ( SELECT u.id, u.public_id, u.username, i.nickname, i.image, i.show_on_leaderboard, ( u.status = $5 AND i.show_on_leaderboard AND NOT EXISTS ( SELECT $6 FROM identity.user_roles ur JOIN ide` | 2380 | 11.90 | 28327 | 2380 |
| `WITH me AS ( SELECT u.id, u.public_id, u.username, i.nickname, i.image, i.show_on_leaderboard, ( u.status = $5 AND i.show_on_leaderboard AND NOT EXISTS ( SELECT $6 FROM identity.user_roles ur JOIN ide` | 1190 | 15.03 | 17890 | 1190 |
| `WITH me AS ( SELECT u.id, u.public_id, u.username, i.nickname, i.image, i.show_on_leaderboard, ( u.status = $5 AND i.show_on_leaderboard AND NOT EXISTS ( SELECT $6 FROM identity.user_roles ur JOIN ide` | 1190 | 14.71 | 17504 | 1190 |
| `select * from learning_progress($1, $2)` | 1087 | 15.41 | 16748 | 1087 |
| `SELECT public.refresh_ranking_snapshot() AS refreshed` | 4 | 1347.76 | 5391 | 4 |
| `select * from learning_lesson($1, $2)` | 1190 | 2.87 | 3419 | 1190 |
| `SELECT ch.id::text AS id, ch.public_id, ch.type, ch.title, ch.status, COALESCE(ch.points, $3) AS points, ch.quiz_display_count, ch.lesson_id::text AS lesson_id, u.id::text AS user_db_id, h.status AS l` | 2315 | 0.91 | 2096 | 2315 |
| `select * from submit_lesson($1, $2, $3::bigint)` | 176 | 6.67 | 1174 | 176 |
| `SELECT e.awarded, e.exp_after, e.previous_level, e.new_level FROM ( SELECT EXISTS ( SELECT $4 FROM challenge.hint_views hv WHERE hv.user_id = $1::bigint AND hv.challenge_id = $2::bigint AND hv.level =` | 270 | 3.34 | 902 | 270 |
| `INSERT INTO challenge.question_submissions (user_id, question_id, question_option_id, is_correct) SELECT $1, q_id, o_id, ok FROM unnest($2::bigint[], $3::bigint[], $4::boolean[]) AS t(q_id, o_id, ok)` | 771 | 1.04 | 799 | 1803 |

## Resources (peaks over the whole run)

| metric | peak |
|---|---|
| app CPU % | 96.2 |
| app memory MB | 1022 |
| database CPU % | 103.2 |
| database memory MB | 569 |
| database connections (active + idle) | 21 |
| locks waiting | 0 |
| outbox pending (largest queue) | 0 |
| code runs queued (all states) | 118 |
| dead letters open | 0 |

## Assumptions

- Environment `loadtest`, profile `stress`, Inngest `inline`, Prometheus remote-write off, max VUs 200.
- Seed: 5000 users, 200 pre-minted sessions (one per VU).
- Journey mix by request count: learner 55.9%, guest 29.2%, coder 1.4%, social 13.6%.
- Outcome per request comes from the client's `failed_requests` / `limited` metrics, not the HTTP status (server actions return 200 on failure).
