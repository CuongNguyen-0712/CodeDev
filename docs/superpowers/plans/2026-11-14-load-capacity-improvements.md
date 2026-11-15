# Load Capacity Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Báo cáo phân tích lượt stress đầu, rồi cải thiện cho tới khi 2 lượt stress local hợp lệ liên tiếp đều có N ≥ 100.

**Architecture:** Vòng 1 sửa `rankingDb.getStanding` để `ranking_scores` nhận id người xem là tham số bind (PostgreSQL lập plan với giá trị thật, gập `_user_id IS NULL`, dùng index), giữ điểm live. Sau đó lặp: chạy stress → cập nhật file phân tích → sửa đúng một nút thắt lớn nhất → chạy lại, tối đa 4 vòng sau vòng 1.

**Tech Stack:** PostgreSQL 16 (`postgres-load`), Node (`lib/db.js` driver `pg`/Neon), Vitest integration tests, bộ công cụ `npm run load:*` đã có.

**Spec:** `docs/superpowers/specs/2026-11-14-load-capacity-improvements-design.md`

## Global Constraints

- "Đạt" = 2 lần chạy stress hợp lệ liên tiếp đều có N ≥ 100; bậc 150/200 gãy không tính.
- Lệnh stress mỗi lần: `npm run load:run -- --env .env.loadtest --profile stress --inngest inline --max-vus 200 --sessions 200` (thêm `--build` khi code app đã đổi kể từ lần build image trước).
- Không đổi điều kiện đo: ngưỡng, hành trình, tỷ lệ hành trình, giới hạn container (app 1 vCPU / 2 GB, DB 1 vCPU / 4 GB), seed 5 000 user.
- Không lấy `DB_POOL_MAX` làm cách sửa chính.
- Điểm của chính người xem vẫn live; vị trí vẫn đếm trên `profile.ranking_snapshot`.
- Không cache làm người dùng thấy dữ liệu cũ sau thao tác của chính họ.
- Thay đổi DB chỉ qua `db/migrations` + `db/tools/export-schema.mjs`; không sửa tay `db/functions/`.
- Không thêm dependency. Đo chỉ ở local; không chạm Neon/production.
- Mỗi vòng sau vòng 1 chỉ một thay đổi; tối đa 4 vòng sau vòng 1, hết thì dừng và hỏi chủ dự án.

## Review Focus

1. Người xem không tồn tại (`userKey` sai): `getStanding` phải trả 0 dòng như hiện tại (route trả standing rỗng, không 500). → test ở Task 2.
2. Người xem chưa có giao dịch exp/point nào: score 0, `position` null như hiện tại. → test ở Task 2.
3. Bảng 30 ngày (`since` khác null) vẫn chỉ tính giao dịch trong kỳ khi `since` và id đều là tham số. → test có sẵn "scores the 30-day board…" phải vẫn pass (Task 2).
4. Plan generic: nếu driver dùng prepared statement có tên, PostgreSQL có thể chuyển sang plan generic sau vài lần và quét bảng trở lại. → kiểm qua `pg_stat_statements` sau smoke ở Task 2.
5. Image app cũ: chạy stress mà không `--build` sau khi đổi code thì đo bản cũ. → Task 3 bắt buộc `--build` ở lần chạy đầu và ghi `meta.commit` khớp HEAD.

---

### Task 1: File phân tích lượt stress đầu (vòng 0)

**Files:**
- Create: `docs/loadtest/2026-11-14-stress-analysis.md`

**Interfaces:**
- Produces: file phân tích có mục "Vòng 0" mà các task sau thêm mục "Vòng k".

- [ ] **Step 1: Bật DB load để đo.** Run: `npm run load:compose -- --profile loadtest up -d postgres-load`. Expected: container healthy.
- [ ] **Step 2: Lấy bằng chứng `EXPLAIN (ANALYZE, TIMING OFF, SUMMARY ON)` trên `loadtest_run`** cho: (a) `SELECT * FROM public.ranking_scores(NULL, <id lt_00042>)`; (b) cùng hàm qua `LEFT JOIN LATERAL public.ranking_scores(NULL, u.id)` như `getStanding`; (c) `learning_progress(<publicId>, <courseId>)` của cùng user. Expected (đã đo lúc viết spec): (a) ~5 ms dùng index, (b) ~58 ms `Seq Scan` trên `profile.exp_transaction` và `profile.point_transaction`, (c) ~62 ms.
- [ ] **Step 3: Viết file phân tích (tiếng Việt)** với các mục: Kết quả (N, bậc gãy, p95, tỷ lệ lỗi 500/503/timeout); Chuỗi nguyên nhân (pool 10 cạn, mốc 10 s = `DB_CONNECT_TIMEOUT_MS`, câu ranking quét toàn bảng 6 lần mỗi `/api/ranking/me`); Bằng chứng (trích báo cáo `docs/loadtest/2026-11-14-loadtest-stress.md`, sampler, `pg_stat_statements`, kết quả Step 2); Giả thuyết và cách kiểm chứng; Việc theo thứ tự ưu tiên (vòng 1 ranking; ứng viên sau: `learning_progress`, `/api/user/me`, `refresh_ranking_snapshot`). Mọi con số lấy từ run dir `tests/loadtest/runs/20261114-0115-loadtest-stress` hoặc Step 2, không ước lượng.
- [ ] **Step 4: Commit**

```bash
git add docs/loadtest/2026-11-14-stress-analysis.md
git commit -m "docs(loadtest): analysis of the first stress run"
```

---

### Task 2: Ranking standing dùng index, giữ điểm live

**Files:**
- Modify: `db/ranking.db.js:85-125` (`getStanding`)
- Test: `__tests__/ranking/ranking.integration.test.js`
- Modify: `docs/loadtest/2026-11-14-stress-analysis.md` (mục "Vòng 1 — thay đổi")

**Interfaces:**
- Consumes: `sql(text, params)` từ `@/lib/db`.
- Produces: `rankingDb.getStanding({ board, since = null, userKey }) → Promise<{ rows }>` — cùng chữ ký, cùng cột trả về, 0 dòng khi `userKey` không tồn tại.

- [ ] **Step 1: Viết test (integration, dùng helper `standing` và dữ liệu có sẵn trong file)**

```js
it("returns no standing for an unknown learner", async () => {
    const res = await rankingDb.getStanding({ board: "overall", userKey: "does-not-exist" });
    expect(res.rows).toHaveLength(0);
});

it("gives a learner without ledger entries a zero score and no position", async () => {
    const fresh = await makeUser("fresh"); // makeUser() from this file; no addExp/addPoints
    const s = await standing("overall", fresh);
    expect(Number(s.score)).toBe(0);
    expect(s.position).toBeNull();
});
```

- [ ] **Step 2: Chạy, xác nhận test mới pass trên code cũ (test đặc tả hành vi hiện tại, khoá hành vi trước khi đổi).** Run: `npx vitest run __tests__/ranking/ranking.integration.test.js`. Expected: PASS toàn bộ.
- [ ] **Step 3: Đổi `getStanding`**: câu thứ nhất `SELECT id FROM identity.users WHERE public_id = $1` lấy id người xem (không có → trả nguyên kết quả 0 dòng); câu standing dùng `u.id = $5` trong `me` và `public.ranking_scores($2::timestamptz, $5::bigint)` / `public.ranking_scores(NULL, $5::bigint)` thay cho `u.id`. Phần position, tier, `VISIBLE`, `snapshotPeriod` giữ nguyên. Comment một dòng: vì sao id là tham số (để PostgreSQL gập `_user_id IS NULL` và dùng index).
- [ ] **Step 4: Chạy lại.** Run: `npx vitest run __tests__/ranking`. Expected: PASS toàn bộ (gồm "scores the 30-day board…" và test opt-out).
- [ ] **Step 5: Kiểm chứng index (ghi vào file phân tích, mục Vòng 1).**
  - `EXPLAIN (ANALYZE …)` câu standing mới trên `loadtest_run` với giá trị thật: không `Seq Scan` trên `exp_transaction`/`point_transaction`; thời gian ~vài ms.
  - Đọc `lib/db.js` (nhánh `pg` `pool.query(text, params)` và nhánh Neon `neonSql.query`): ghi lại driver gửi câu có tên hay không.
  - Chạy `npm run load:run -- --env .env.loadtest --profile smoke --inngest inline --build`; trong `statements.json` của run dir, câu standing (`WITH me AS …`) có mean ≤ 20 ms.
  - Nếu một trong ba không đạt: dừng, báo BLOCKED kèm bằng chứng (phương án dự phòng của spec §5.2 cần quyết định riêng).
- [ ] **Step 6: Commit**

```bash
git add db/ranking.db.js __tests__/ranking/ranking.integration.test.js docs/loadtest/2026-11-14-stress-analysis.md
git commit -m "perf(ranking): bind the viewer id so standing uses the ledger indexes"
```

---

### Task 3: Vòng đo sau vòng 1

**Files:**
- Create: `docs/loadtest/<yyyy-mm-dd>-loadtest-stress*.md` (do `report.mjs` sinh, không sửa tay)
- Modify: `docs/loadtest/2026-11-14-stress-analysis.md` (mục "Vòng 1 — kết quả")

**Interfaces:**
- Consumes: code đã đổi ở Task 2; lệnh stress ở Global Constraints.

- [ ] **Step 1: Chạy stress lần 1 với `--build`.** Run: lệnh stress ở Global Constraints kèm `--build`. Expected: run dir mới; `meta.json` `commit` = HEAD hiện tại; báo cáo sinh ra trong `docs/loadtest/`.
- [ ] **Step 2: Chạy stress lần 2 (không cần `--build`).** Expected: run dir và báo cáo thứ hai.
- [ ] **Step 3: Cập nhật file phân tích**: mỗi lần chạy ghi N, hợp lệ hay không, bậc gãy và lý do, 3 endpoint p95 cao nhất, 3 query nặng nhất, đỉnh CPU app/DB, đỉnh `active`; so với vòng 0. Kết luận: **Đạt** (cả hai lần hợp lệ và N ≥ 100) hoặc **Chưa đạt** kèm nút thắt lớn nhất và bằng chứng.
- [ ] **Step 4: Commit**

```bash
git add docs/loadtest
git commit -m "docs(loadtest): stress results after the ranking fix"
```

---

### Task 4+: Các vòng tiếp theo (chỉ khi Task 3 kết luận Chưa đạt)

Mỗi vòng k (k = 2…5) là một task riêng do người điều phối viết khi tới lượt, theo spec §5.3, từ nút thắt mà file phân tích vừa chỉ ra:

- **Files:** đúng chỗ code của nút thắt đó + test của nó + file phân tích + báo cáo stress mới.
- **Bước:** test khoá hành vi hiện tại (hoặc test cho hành vi mới nếu là bug) → một thay đổi → test pass → hai lần stress (lần đầu `--build`) → cập nhật file phân tích mục "Vòng k" → commit.
- **Dừng:** khi một vòng kết luận Đạt; hoặc sau vòng 5 mà vẫn Chưa đạt → ghi N đạt được và nút thắt còn lại, hỏi chủ dự án.
