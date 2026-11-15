# Cải thiện khả năng chịu tải — thiết kế

Date: 2026-11-14. Status: chờ duyệt. Tiếp theo của `2026-11-13-load-capacity-design.md` (bộ công cụ đo đã xong, merge vào `develop` ở `0e22a26f`).

## 1. Mục đích

Lượt stress local đầu tiên (`docs/loadtest/2026-11-14-loadtest-stress.md`, run `20261114-0115-loadtest-stress`) gãy ngay ở 50 người dùng đồng thời. Chủ dự án đặt mốc: **chịu được 100 người dùng đồng thời** trên môi trường đo local hiện có. Cần hai thứ:

1. **Báo cáo phân tích** lượt stress: điều gì gãy, vì sao, bằng chứng.
2. **Cải thiện** cho tới khi báo cáo stress local đạt mốc.

## 2. Hiện trạng (đã đo)

- Bậc 0 (50 VU): p95 đọc 10 016 ms, lỗi 20,5% (500 ×374, 503 ×24, timeout k6 ×25). 13 endpoint đọc dừng ở ~10 s = `DB_CONNECT_TIMEOUT_MS` (`lib/db.js:42`): request chờ kết nối từ pool 10 (`DB_POOL_MAX`) đến hết giờ.
- DB sampler: `active` 11 gần suốt cửa sổ đo; CPU DB 106% (trần 1 vCPU), CPU app 97%.
- `pg_stat_statements`: câu `WITH me AS …` của `rankingDb.getStanding` (`db/ranking.db.js:91-125`) 25–28 s mỗi lần; `learning_progress()` 180 ms trung bình × 73; `refresh_ranking_snapshot()` 2,3 s.
- Đo lại khi DB rảnh (loadtest_run, 100 001 dòng `profile.exp_transaction`, 50 001 dòng `profile.point_transaction`):
  - `SELECT * FROM ranking_scores(NULL, <id hằng>)`: **5 ms**, dùng index.
  - Cùng hàm qua `LEFT JOIN LATERAL ranking_scores(NULL, u.id)` như `getStanding`: **58 ms**, **Seq Scan** cả hai bảng. Hàm SQL được inline; điều kiện `(_user_id IS NULL OR t.user_id = _user_id)` với `u.id` là cột (không phải hằng) nên không gập được, index `idx_exp_transaction_user_created` / `idx_point_transaction_earned` không dùng được.
  - `getStanding` gọi hàm 2 lần (`s` theo kỳ, `a` toàn thời gian); `GET /api/ranking/me` → `rankingService.getRanks` chạy 3 board = **6 lần quét toàn bảng** mỗi request; `GET /api/ranking` → 2 lần.
  - `learning_progress(...)`: 62 ms khi rảnh.
- Giả thuyết (có số đo, chưa chứng minh dưới tải): các lần quét ranking xếp hàng trên 1 vCPU, giữ kết nối hàng chục giây, pool cạn, mọi endpoint khác chờ kết nối tới timeout.

## 3. Mục tiêu, không làm, phản mục tiêu

**Mục tiêu**

- Báo cáo stress local có **N ≥ 100** (bậc 50 và bậc 100 đều đạt p95 đọc < 800 ms, p95 ghi < 1 500 ms, lỗi < 1%; ngưỡng và cách tính như hiện có), lần chạy hợp lệ.
- *(Quyết định của người viết spec)* "Đạt" = **2 lần chạy stress hợp lệ liên tiếp** đều có N ≥ 100 (chống một lần may mắn trên máy chỉ có 1 vCPU mỗi phía). Bậc 150/200 gãy không ảnh hưởng; chúng chỉ cho biết còn dư bao nhiêu.
- Một file phân tích viết tay cho lượt stress đầu và cho mỗi vòng cải thiện.
- Hành vi sản phẩm không đổi.

**Không làm**: pha Vercel/Neon; deploy production; tối ưu những gì báo cáo chưa chỉ ra là nút thắt; nâng mốc quá 100.

**Phản mục tiêu** (đạt số vẫn là hỏng):

- Đổi điều kiện đo để qua: nới ngưỡng, bớt hành trình/endpoint, đổi tỷ lệ hành trình, tăng giới hạn CPU/RAM container (app 1 vCPU / 2 GB, DB 1 vCPU / 4 GB), giảm dữ liệu seed (5 000 user).
- Tăng `DB_POOL_MAX` làm cách sửa chính (DB chỉ 1 vCPU: thêm kết nối không thêm CPU, chỉ dài hàng chờ).
- Đổi ngữ nghĩa ranking: điểm của chính người xem phải vẫn live (`db/ranking.db.js:85-89`), vị trí vẫn đếm trên snapshot như hiện tại.
- Cache làm sai dữ liệu người dùng thấy (điểm/tiến độ cũ sau khi họ vừa thay đổi).

## 4. Các cách đã cân nhắc (ranking)

| Cách | Đánh đổi |
|---|---|
| A. Điểm người xem cũng lấy từ snapshot | Nhanh nhất, diff nhỏ nhất. Đổi hành vi: điểm người xem trễ tới `TTL.RANKING_SNAPSHOT` (5 phút). |
| **B. Giữ điểm live, cho truy vấn dùng index (đã chọn)** | Hành vi không đổi; 58 ms → ~5 ms khi rảnh. Cần đổi cách gọi hàm. |
| C. Chỉ cache standing trong Redis | Lần đầu của mỗi người vẫn quét toàn bảng; 100 người khác nhau gần như không đỡ. Loại. |

## 5. Thiết kế

### 5.1 Báo cáo phân tích

`docs/loadtest/2026-11-14-stress-analysis.md` (tiếng Việt, viết tay, commit): tóm tắt kết quả, chuỗi nhân quả (§2), bằng chứng (dòng báo cáo, sampler, `pg_stat_statements`, `EXPLAIN ANALYZE` khi rảnh), giả thuyết và cách kiểm chứng, danh sách việc theo thứ tự ưu tiên. Mỗi vòng cải thiện (§5.3) thêm một mục "Vòng k": thay đổi, báo cáo stress mới, N, nút thắt kế tiếp.

### 5.2 Vòng 1: ranking dùng index, giữ điểm live

*(Quyết định của người viết spec)* Cách làm B không cần migration: `getStanding` lấy `id` nội bộ của người xem trước (theo `public_id`), rồi gọi `ranking_scores($since, $id)` và `ranking_scores(NULL, $id)` với `$id` là **tham số bind**. Driver `pg` và Neon gửi câu không tên kèm giá trị, PostgreSQL lập plan riêng với giá trị thật nên `$id IS NULL` gập được và index được dùng. Cách đọc vị trí, tier, điều kiện hiển thị giữ nguyên.

- Kiểm chứng bằng `EXPLAIN ANALYZE` trên `loadtest_run` (ghi vào file phân tích): không còn `Seq Scan` trên `exp_transaction`/`point_transaction` trong câu standing, thời gian cùng bậc với gọi hàm trực tiếp (~5 ms khi rảnh). *(Quyết định của người viết spec)* `EXPLAIN` tay chưa đủ vì driver có thể dùng prepared statement / plan generic: kiểm tra thêm qua đường thật của app — đọc `lib/db.js` xem driver gửi câu có tên hay không, và sau một lượt smoke `pg_stat_statements` phải cho câu standing mean ở mức vài ms. Chỉ khi một trong hai không đạt mới làm phương án dự phòng dưới đây.
- Nếu plan không dùng index (ví dụ plan generic): dùng phương án dự phòng — migration mới thêm hàm SQL chỉ cho một user (không có nhánh `IS NULL OR`) dùng chung công thức với `ranking_scores` (không chép công thức hai nơi). Người làm chọn cách tránh chép công thức và ghi lý do.
- Test integration hiện có của ranking phải vẫn pass; thêm một test cho thấy kết quả standing của một user bằng đúng kết quả trước khi đổi (cùng dữ liệu, cùng board/kỳ).
- `refresh_ranking_snapshot()` (2,3 s): kiểm tra `ensureRankingSnapshot` (`services/ranking.service.js:40-49`) chỉ để một request trả giá khi snapshot hết hạn; nếu nhiều request cùng lúc đều chạy refresh hoặc cùng chờ, ghi lại trong file phân tích và sửa ở vòng nào báo cáo chỉ ra nó.

### 5.3 Vòng đo – sửa

Mỗi vòng:

1. Chạy stress local: `npm run load:run -- --env .env.loadtest --profile stress --inngest inline --max-vus 200 --sessions 200` (bậc 50/100/150/200, đủ để thấy N ≥ 100 và còn bao xa). Môi trường, seed 5 000 user, giới hạn container giữ nguyên như lượt đầu.
2. Đọc báo cáo sinh ra (commit vào `docs/loadtest/`), cập nhật file phân tích: N, nút thắt lớn nhất kèm bằng chứng.
3. N ≥ 100 và lần chạy hợp lệ: **dừng**.
4. Chưa đạt: sửa đúng nút thắt lớn nhất báo cáo chỉ ra (một thay đổi mỗi vòng để biết thay đổi nào có tác dụng), có test, rồi quay lại bước 1.

*(Quyết định của người viết spec)* Tối đa **4 vòng** sau vòng 1. Hết 4 vòng mà chưa đạt: dừng, ghi file phân tích với N đạt được và nút thắt còn lại, hỏi chủ dự án.

Ứng viên đã biết cho các vòng sau (chỉ làm khi báo cáo chỉ ra): `learning_progress()` (62 ms rảnh, 180 ms tải), `/api/user/me`, `refresh_ranking_snapshot()`.

*(Quyết định của người viết spec)* Phạm vi sửa ở các vòng sau là **mọi lớp** (SQL, service, route, cache), không chỉ DB — lượt đầu app cũng đã ở 97% CPU của 1 vCPU, nên nút thắt kế tiếp có thể nằm ở app. Cache chỉ được dùng cho dữ liệu giống nhau với mọi người dùng, hoặc dữ liệu theo người dùng được xoá/làm mới khi chính người đó ghi (theo cơ chế `invalidateUserCache` / version key hiện có); không cache nào được làm người dùng thấy dữ liệu cũ sau thao tác của chính họ.

## 6. Ràng buộc

- Mọi thay đổi DB qua `db/migrations` + `db/tools/export-schema.mjs` như quy ước repo; hàm trong `db/functions/` không sửa tay.
- Không thêm dependency.
- Đo chỉ ở local (`postgres-load`, app container); không chạm Neon/production.
- Mỗi lần chạy stress mất ~10–15 phút; lúc đó dev server và test DB local vẫn dùng được (stack load riêng).

## 7. Để lại cho người làm

- Cách lấy `id` người xem trong `getStanding` (câu riêng hay đưa vào service).
- Nội dung và cấu trúc chi tiết file phân tích.
- Cách sửa ở các vòng sau, theo bằng chứng từng vòng.
