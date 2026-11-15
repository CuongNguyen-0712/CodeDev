# Load test report: preview / stress

Run `20261115-1019-preview-stress`, commit `280f60e2`, 2026-11-15T03:19:57.236Z to 2026-11-15T03:28:37.314Z.

## Capacity (N)

**N = none**: the first stage already broke a threshold.
First break at stage 0 (50 VUs): read p95 957 ms > 800.

Thresholds: read p95 < 800 ms, write p95 < 1500 ms, error rate < 1% (HTTP 429 is not an error). A stage passes only strictly below each limit; N is the highest stage where every stage up to it passes. Requests after the scheduled end (VUs finishing their last iteration) are dropped.
Only the hold window is measured: points in the first 10 s of each 120 s stage (the ramp) are ignored, so N is read at a steady VU level. Stage start = first tagged k6 point + stage x 120 s.

| stage | VUs | reads | read p95 ms | writes | write p95 ms | requests | error % | 429 |
|---|---|---|---|---|---|---|---|---|
| 0 | 50 | 1711 | 957 | 198 | 1111 | 1909 | 0.68 | 0 |
| 1 | 100 | 3424 | 902 | 417 | 1052 | 3841 | 0.81 | 0 |
| 2 | 150 | 5074 | 884 | 651 | 1032 | 5726 | 0.89 | 0 |
| 3 | 200 | 6842 | 875 | 825 | 1041 | 7667 | 0.77 | 23 |

Bottleneck endpoints at the break stage (50 VUs) (p95 over 2x the class threshold): none.

Endpoint table below is for the break stage (no N).

## Run validity

Valid: worst 1-minute mean host CPU of the load machine during the k6 test window (setup and VU initialisation excluded) 0% (limit 80%).
k6 container peak CPU: n/a% (informational; docker percent, 100 = one core).
k6 exit code: 0.

## Latency by endpoint

| endpoint | class | n | p50 ms | p95 ms | p99 ms |
|---|---|---|---|---|---|
| /roadmap | read | 69 | 773 | 1362 | 2221 |
| /course | read | 76 | 905 | 1329 | 1720 |
| /api/challenges/:id/workspace | read | 6 | 312 | 1269 | 1269 |
| sendMessageAction | write | 21 | 805 | 1226 | 1311 |
| queueCodeRunAction | write | 7 | 780 | 1111 | 1111 |
| recordLessonVisitAction | write | 88 | 752 | 1100 | 1288 |
| registerCourseAction | write | 9 | 626 | 1075 | 1075 |
| submitQuizAction | write | 50 | 781 | 1044 | 1317 |
| sendFriendRequestAction | write | 23 | 739 | 1020 | 1203 |
| /learning/:id | read | 92 | 706 | 1014 | 2494 |
| /contact | read | 20 | 781 | 1012 | 1183 |
| /api/user/learning-progress | read | 88 | 313 | 871 | 2848 |
| /api/user/course-progress | read | 77 | 312 | 867 | 1237 |
| /course/:id | read | 75 | 326 | 865 | 1478 |
| /api/friends | read | 20 | 305 | 856 | 897 |
| /api/ranking/me | read | 78 | 316 | 855 | 896 |
| /api/course/course-details | read | 75 | 295 | 841 | 1467 |
| /api/course/learning | read | 86 | 331 | 714 | 1291 |
| /api/chat/conversations/:id/messages | read | 22 | 305 | 671 | 837 |
| /api/course/filters | read | 74 | 71 | 659 | 2509 |
| /api/chat/conversations | read | 22 | 301 | 657 | 659 |
| /api/course/courses | read | 74 | 299 | 631 | 1497 |
| /api/ranking | read | 79 | 315 | 629 | 856 |
| / | read | 62 | 324 | 617 | 940 |
| /api/challenges/:id/quiz | read | 87 | 307 | 574 | 936 |
| /ranking | read | 79 | 308 | 571 | 1470 |
| /learning | read | 76 | 311 | 566 | 578 |
| /api/course/rating | read | 75 | 290 | 564 | 1533 |
| /api/course/comments | read | 75 | 289 | 549 | 861 |
| /messages | read | 22 | 312 | 547 | 841 |
| /api/user/me | read | 76 | 292 | 546 | 826 |
| /api/friends/counts | read | 20 | 285 | 541 | 542 |
| /api/friends/invitations | read | 40 | 288 | 533 | 869 |
| /api/roadmap/list | read | 66 | 86 | 406 | 1008 |

## HTTP 429 by endpoint (measured window)

| endpoint | class | 429 |
|---|---|---|
| /api/course/comments | read | 12 |
| /api/course/rating | read | 11 |

## Top 10 queries (pg_stat_statements, by total time)

| query | calls | mean ms | total ms | rows |
|---|---|---|---|---|
| `WITH me AS ( SELECT u.id, u.public_id, u.username, i.nickname, i.image, i.show_on_leaderboard, ( u.status = $5 AND i.show_on_leaderboard AND NOT EXISTS ( SELECT $6 FROM identity.user_roles ur JOIN ide` | 2044 | 6.03 | 12334 | 2044 |
| `WITH me AS ( SELECT u.id, u.public_id, u.username, i.nickname, i.image, i.show_on_leaderboard, ( u.status = $5 AND i.show_on_leaderboard AND NOT EXISTS ( SELECT $6 FROM identity.user_roles ur JOIN ide` | 1022 | 10.04 | 10257 | 1022 |
| `WITH me AS ( SELECT u.id, u.public_id, u.username, i.nickname, i.image, i.show_on_leaderboard, ( u.status = $5 AND i.show_on_leaderboard AND NOT EXISTS ( SELECT $6 FROM identity.user_roles ur JOIN ide` | 1022 | 9.98 | 10197 | 1022 |
| `select * from learning_progress($1, $2)` | 941 | 9.49 | 8929 | 941 |
| `select * from learning_lesson($1, $2)` | 1022 | 3.38 | 3454 | 1022 |
| `SELECT public.refresh_ranking_snapshot() AS refreshed` | 8 | 198.50 | 1588 | 8 |
| `SELECT ch.id::text AS id, ch.public_id, ch.type, ch.title, ch.status, COALESCE(ch.points, $3) AS points, ch.quiz_display_count, ch.lesson_id::text AS lesson_id, u.id::text AS user_db_id, h.status AS l` | 1685 | 0.33 | 548 | 1685 |
| `RESET ALL` | 24667 | 0.01 | 351 | 0 |
| `DISCARD TEMP` | 24667 | 0.01 | 321 | 0 |
| `SELECT e.awarded, e.exp_after, e.previous_level, e.new_level FROM ( SELECT EXISTS ( SELECT $4 FROM challenge.hint_views hv WHERE hv.user_id = $1::bigint AND hv.challenge_id = $2::bigint AND hv.level =` | 163 | 1.72 | 280 | 163 |

## Resources (peaks over the whole run)

| metric | peak |
|---|---|
| app CPU % | n/a |
| app memory MB | n/a |
| database CPU % | n/a |
| database memory MB | n/a |
| database connections (active + idle) | n/a |
| locks waiting | n/a |
| outbox pending (largest queue) | n/a |
| code runs queued (all states) | n/a |
| dead letters open | n/a |

## Assumptions

- Environment `preview`, profile `stress`, Inngest `deployed`, Prometheus remote-write off, max VUs 200.
- Seed: 5000 users, 200 pre-minted sessions (one per VU).
- Journey mix by request count: guest 31.1%, learner 54.7%, social 13.0%, coder 1.2%.
- Outcome per request comes from the client's `failed_requests` / `limited` metrics, not the HTTP status (server actions return 200 on failure).
