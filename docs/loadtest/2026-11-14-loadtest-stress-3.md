# Load test report: loadtest / stress

Run `20261114-1034-loadtest-stress`, commit `e85576e6`, 2026-11-14T03:34:53.459Z to 2026-11-14T03:43:55.782Z.

## Capacity (N)

**N = 200 concurrent VUs.**
No threshold broke before the run ended (the real limit is above the last stage; raise --max-vus).

Thresholds: read p95 < 800 ms, write p95 < 1500 ms, error rate < 1% (HTTP 429 is not an error). A stage passes only strictly below each limit; N is the highest stage where every stage up to it passes. Requests after the scheduled end (VUs finishing their last iteration) are dropped.
Only the hold window is measured: points in the first 10 s of each 120 s stage (the ramp) are ignored, so N is read at a steady VU level. Stage start = first tagged k6 point + stage x 120 s.

| stage | VUs | reads | read p95 ms | writes | write p95 ms | requests | error % | 429 |
|---|---|---|---|---|---|---|---|---|
| 0 | 50 | 2005 | 29 | 275 | 173 | 2280 | 0.00 | 0 |
| 1 | 100 | 3997 | 31 | 602 | 60 | 4599 | 0.00 | 0 |
| 2 | 150 | 6011 | 61 | 830 | 198 | 6841 | 0.00 | 0 |
| 3 | 200 | 7959 | 89 | 1130 | 210 | 9089 | 0.00 | 0 |

Bottleneck endpoints at N (200 VUs) (p95 over 2x the class threshold): none.

Endpoint table below is for N (200 VUs).

## Run validity

Valid: worst 1-minute mean host CPU of the load machine during the k6 test window (setup and VU initialisation excluded) 25.4% (limit 80%).
k6 container peak CPU: 48.3% (informational; docker percent, 100 = one core).
k6 exit code: 0.

## Latency by endpoint

| endpoint | class | n | p50 ms | p95 ms | p99 ms |
|---|---|---|---|---|---|
| /roadmap | read | 229 | 22 | 586 | 1361 |
| respondFriendRequestAction | write | 58 | 18 | 419 | 813 |
| sendMessageAction | write | 118 | 27 | 372 | 1019 |
| submitQuizAction | write | 265 | 25 | 353 | 688 |
| /api/user/me | read | 442 | 8 | 351 | 1069 |
| /contact | read | 130 | 30 | 343 | 1321 |
| queueCodeRunAction | write | 28 | 225 | 320 | 1153 |
| /learning/:id | read | 490 | 20 | 295 | 1289 |
| /api/challenges/:id/quiz | read | 470 | 11 | 292 | 1123 |
| /api/ranking/me | read | 461 | 24 | 182 | 488 |
| /course | read | 230 | 22 | 170 | 1329 |
| submitLessonAction | write | 79 | 19 | 163 | 801 |
| /api/user/learning-progress | read | 461 | 15 | 152 | 409 |
| sendFriendRequestAction | write | 74 | 18 | 140 | 1305 |
| /api/ranking | read | 461 | 17 | 117 | 477 |
| /api/user/course-progress | read | 442 | 8 | 88 | 171 |
| /api/friends/invitations | read | 260 | 6 | 88 | 212 |
| recordLessonVisitAction | write | 461 | 10 | 86 | 161 |
| /api/course/learning | read | 461 | 11 | 84 | 258 |
| /api/chat/conversations/:id/messages | read | 127 | 9 | 80 | 209 |
| /api/chat/conversations | read | 127 | 12 | 76 | 239 |
| /api/friends | read | 130 | 7 | 75 | 170 |
| /api/friends/counts | read | 130 | 5 | 63 | 293 |
| /api/course/comments | read | 235 | 6 | 61 | 146 |
| /api/challenges/:id/workspace | read | 29 | 10 | 59 | 62 |
| /course/:id | read | 236 | 4 | 56 | 553 |
| /api/course/rating | read | 236 | 6 | 52 | 111 |
| registerCourseAction | write | 47 | 11 | 43 | 121 |
| /api/course/course-details | read | 236 | 4 | 38 | 74 |
| /ranking | read | 461 | 4 | 33 | 881 |
| /messages | read | 127 | 4 | 30 | 661 |
| /learning | read | 442 | 4 | 23 | 45 |
| / | read | 217 | 4 | 21 | 599 |
| /api/roadmap/list | read | 229 | 3 | 19 | 55 |
| /api/course/courses | read | 230 | 4 | 19 | 59 |
| /api/course/filters | read | 230 | 2 | 13 | 33 |

## HTTP 429 by endpoint (measured window)

None.

## Top 10 queries (pg_stat_statements, by total time)

| query | calls | mean ms | total ms | rows |
|---|---|---|---|---|
| `WITH me AS ( SELECT u.id, u.public_id, u.username, i.nickname, i.image, i.show_on_leaderboard, ( u.status = $5 AND i.show_on_leaderboard AND NOT EXISTS ( SELECT $6 FROM identity.user_roles ur JOIN ide` | 2448 | 8.38 | 20523 | 2448 |
| `select * from learning_progress($1, $2)` | 1121 | 13.57 | 15211 | 1121 |
| `WITH me AS ( SELECT u.id, u.public_id, u.username, i.nickname, i.image, i.show_on_leaderboard, ( u.status = $5 AND i.show_on_leaderboard AND NOT EXISTS ( SELECT $6 FROM identity.user_roles ur JOIN ide` | 1224 | 9.98 | 12213 | 1224 |
| `WITH me AS ( SELECT u.id, u.public_id, u.username, i.nickname, i.image, i.show_on_leaderboard, ( u.status = $5 AND i.show_on_leaderboard AND NOT EXISTS ( SELECT $6 FROM identity.user_roles ur JOIN ide` | 1224 | 9.22 | 11281 | 1224 |
| `SELECT public.refresh_ranking_snapshot() AS refreshed` | 3 | 1275.42 | 3826 | 3 |
| `select * from learning_lesson($1, $2)` | 1224 | 2.85 | 3485 | 1224 |
| `SELECT ch.id::text AS id, ch.public_id, ch.type, ch.title, ch.status, COALESCE(ch.points, $3) AS points, ch.quiz_display_count, ch.lesson_id::text AS lesson_id, u.id::text AS user_db_id, h.status AS l` | 2294 | 0.77 | 1761 | 2294 |
| `select * from submit_lesson($1, $2, $3::bigint)` | 199 | 5.39 | 1072 | 199 |
| `SELECT e.awarded, e.exp_after, e.previous_level, e.new_level FROM ( SELECT EXISTS ( SELECT $4 FROM challenge.hint_views hv WHERE hv.user_id = $1::bigint AND hv.challenge_id = $2::bigint AND hv.level =` | 291 | 1.92 | 558 | 291 |
| `SELECT code, title, awarded, exp_after, new_level FROM public.award_achievements($1::bigint)` | 291 | 1.70 | 495 | 0 |

## Resources (peaks over the whole run)

| metric | peak |
|---|---|
| app CPU % | 100.9 |
| app memory MB | 1023 |
| database CPU % | 97.2 |
| database memory MB | 597 |
| database connections (active + idle) | 21 |
| locks waiting | 0 |
| outbox pending (largest queue) | 0 |
| code runs queued (all states) | 94 |
| dead letters open | 0 |

## Assumptions

- Environment `loadtest`, profile `stress`, Inngest `inline`, Prometheus remote-write off, max VUs 200.
- Seed: 5000 users, 200 pre-minted sessions (one per VU).
- Journey mix by request count: learner 56.9%, guest 28.0%, social 14.0%, coder 1.1%.
- Outcome per request comes from the client's `failed_requests` / `limited` metrics, not the HTTP status (server actions return 200 on failure).
