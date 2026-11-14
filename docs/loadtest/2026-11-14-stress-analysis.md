# Phân tích kết quả stress local

Mục tiêu (spec `docs/superpowers/specs/2026-11-14-load-capacity-improvements-design.md`): 2 lượt stress local hợp lệ liên tiếp đều có **N ≥ 100**. Môi trường đo: app 1 vCPU / 2 GB, PostgreSQL 16 1 vCPU / 4 GB, 5 000 user seed, pool `DB_POOL_MAX` = 10.

## Vòng 0 — lượt stress đầu

Báo cáo: `2026-11-14-loadtest-stress.md` (run `20261114-0115-loadtest-stress`, commit `f8379d48`).

### Kết quả

- **N = none**: gãy ngay bậc 0 (50 VU). p95 đọc 10 016 ms (ngưỡng 800), p95 ghi 1 407 ms, lỗi 20,49%.
- Lỗi: 500 ×374, 503 ×24, k6 timeout (status 0) ×25 — 24 trong số đó ở `/api/ranking`.
- k6 tự dừng (exit 99) sau ~3 phút đo; bậc 1 (100 VU) chỉ đo được 50/110 s.
- Lần chạy hợp lệ: CPU máy tải cao nhất 26,7% trong cửa sổ đo.

### Chuỗi nguyên nhân

1. `GET /api/ranking/me` → `rankingService.getRanks` → `rankingDb.getStanding` cho 3 board; `GET /api/ranking` → 1 board. Mỗi lần `getStanding` gọi `ranking_scores` 2 lần (kỳ đang xem và toàn thời gian) qua `LEFT JOIN LATERAL public.ranking_scores(..., u.id)`.
2. `ranking_scores` là hàm SQL được inline. Điều kiện `(_user_id IS NULL OR t.user_id = _user_id)` chỉ gập được khi `_user_id` là hằng hoặc tham số. Với `u.id` (một cột), PostgreSQL giữ cả nhánh `OR` nên **quét toàn bộ** `profile.exp_transaction` (100 001 dòng) và `profile.point_transaction` (50 001 dòng) mỗi lần gọi. `/api/ranking/me` = 6 lần quét.
3. Trên 1 vCPU, các lần quét xếp hàng: câu `WITH me AS …` lên 25–28 s mỗi lần (`pg_stat_statements`), giữ kết nối suốt thời gian đó.
4. Pool 10 kết nối cạn (`active` 11 = 10 + sampler; vài mẫu 12). Mọi endpoint cần DB chờ kết nối tới `DB_CONNECT_TIMEOUT_MS` = 10 000 ms → 13 endpoint đọc dừng ở p95 ~10 0xx ms và trả 500/503.
5. `/api/ranking` 30 051 ms là timeout 30 s của k6, không phải thời gian server.

CPU DB 106% và CPU app 97% (trần 1 vCPU mỗi bên) là yếu tố góp phần; số kết nối `active` + `idle` lên tới 17, nghĩa là có thể còn một pool/client khác ngoài pool 10.

### Bằng chứng khi DB rảnh (`EXPLAIN (ANALYZE, TIMING OFF)` trên `loadtest_run`, user `lt_00042`)

| Câu | Thời gian | Plan trên bảng giao dịch |
|---|---|---|
| `SELECT * FROM ranking_scores(NULL, <id hằng>)` | 5,5 ms | Index Scan `idx_exp_transaction_user_created`, `idx_point_transaction_earned` |
| `… LEFT JOIN LATERAL ranking_scores(NULL, u.id) …` (cách `getStanding` đang gọi) | 58–145 ms | **Seq Scan** `exp_transaction`, `point_transaction` |
| `learning_progress(<user>, <course>)` | 49–62 ms | — |

`pg_stat_statements` của lượt chạy: `WITH me AS …` 28 612 ms và 25 508 ms (chỉ ghi câu chạy xong; câu bị huỷ không có trong bảng nên số lần thật cao hơn), `learning_progress` 180 ms trung bình × 73, `refresh_ranking_snapshot()` 2 361 ms × 1.

### Giả thuyết và cách kiểm chứng

Quét toàn bảng trong `getStanding` giữ kết nối lâu → pool cạn → mọi endpoint timeout. Kiểm chứng: sửa riêng `getStanding` (vòng 1), chạy lại stress; nếu đúng, các endpoint ~10 s phải hết và N tăng.

### Việc theo thứ tự ưu tiên

1. **Vòng 1**: `getStanding` truyền id người xem dưới dạng tham số bind cho `ranking_scores` (giữ điểm live).
2. Ứng viên sau (chỉ khi báo cáo chỉ ra): `learning_progress()`, `/api/user/me`, `refresh_ranking_snapshot()` (người đọc đầu tiên trả 2,4 s).

## Vòng 1 — thay đổi: ranking standing dùng index

`rankingDb.getStanding` (`db/ranking.db.js`) lấy `id` người xem bằng một câu riêng (`SELECT id FROM identity.users WHERE public_id = $1`), rồi truyền id đó vào `ranking_scores($2, $3::bigint)` / `ranking_scores(NULL, $3::bigint)` dưới dạng tham số bind thay cho `u.id`. Điểm người xem vẫn live; vị trí, tier, điều kiện hiển thị giữ nguyên. User không tồn tại vẫn trả 0 dòng.

Kiểm chứng:

- `EXPLAIN (ANALYZE)` câu dạng standing qua `PREPARE … EXECUTE` với id bind (`loadtest_run`, `lt_00042`): **2,5 ms**, Index Scan `idx_exp_transaction_user_created` và `idx_point_transaction_earned` cho cả hai lần gọi (trước: 58–145 ms, Seq Scan).
- Driver: `lib/db.js` gọi `pool.query(text, params)` (pg) và `neonSql.query(text, params)` (Neon) không đặt tên câu, nên mỗi lần PostgreSQL lập plan với giá trị thật; không có plan generic.
- Smoke (`20261114-1022-loadtest-smoke`, 5 VU, 1 phút): câu `WITH me AS …` trung bình **21–22 ms** (29 lần), so với 25 000–28 000 ms ở vòng 0. Phần còn lại là bước đếm vị trí trên `profile.ranking_snapshot` (không đổi trong vòng này), không còn quét bảng giao dịch.

## Vòng 1 — kết quả: **Đạt**

Hai lượt stress liên tiếp, commit `e85576e6`, `--max-vus 200 --sessions 200`, cùng môi trường và seed như vòng 0:

| Lượt | Báo cáo | N | Hợp lệ (CPU máy tải, cửa sổ đo) | Bậc 200: p95 đọc / ghi, lỗi |
|---|---|---|---|---|
| 1 (`20261114-1025`) | `2026-11-14-loadtest-stress-2.md` | **200** (không bậc nào gãy) | Có, 50,6% | 146 ms / 348 ms, 0,01% |
| 2 (`20261114-1034`) | `2026-11-14-loadtest-stress-3.md` | **200** (không bậc nào gãy) | Có, 25,4% | 89 ms / 210 ms, 0,00% |

So với vòng 0 (gãy ở 50 VU: p95 đọc 10 016 ms, lỗi 20,5%): mọi endpoint ~10 s đã hết, không còn 500/503, giả thuyết pool cạn do câu ranking được xác nhận.

- Endpoint p95 cao nhất (toàn lượt): lượt 1 `/roadmap` 929 ms, `sendFriendRequestAction` 861 ms, `/contact` 820 ms; lượt 2 `/roadmap` 586 ms, `respondFriendRequestAction` 419 ms, `sendMessageAction` 372 ms. p95 theo lớp ở mọi bậc vẫn dưới ngưỡng.
- Query nặng nhất (tổng thời gian): câu standing `WITH me AS …` 2 380–2 448 lần, trung bình 8–12 ms; `learning_progress` 1 121 lần, 13,6 ms.
- Tài nguyên đỉnh: CPU app 96–101% (trần 1 vCPU), RAM app ~1 022 MB / 2 GB, CPU DB 97–103% (trần 1 vCPU), kết nối DB 21, không khoá chờ, outbox 0.

Kết luận: mục tiêu N ≥ 100 đạt ở cả hai lượt; dừng vòng lặp. Lượt chạy chưa đo được giới hạn thật (dừng ở bậc cuối 200 mà chưa gãy), nhưng CPU app và DB đều đã ở trần 1 vCPU tại 200 VU, nên giới hạn có lẽ không xa 200 trên cấu hình này. Muốn biết chính xác: chạy lại với `--max-vus` lớn hơn (ngoài phạm vi mốc 100).
