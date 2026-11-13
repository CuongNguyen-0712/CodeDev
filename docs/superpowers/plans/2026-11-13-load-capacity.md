# Load Capacity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Một bộ công cụ chạy lại được để đo **N** (số người dùng đồng thời cao nhất còn đạt ngưỡng) cùng metric DB/app/hàng đợi, chạy local trước (Postgres 16 trong Docker) rồi Vercel Preview.

**Architecture:** Hạ tầng tải nằm trong `compose.loadtest.yml` (đè lên `compose.yml`, không sửa file gốc): `postgres-load`, service `k6`, và cờ remote-write cho Prometheus. Script Node trong `scripts/loadtest/` lo seed, đăng nhập lấy session, map id server action, lấy mẫu metric, viết báo cáo; phần logic thuần nằm trong module riêng và có test Vitest. Kịch bản k6 ở `loadtest/k6/`; hàm thuần của k6 nằm ở `loadtest/k6/lib/pure.js` (không import `k6/*`) để Vitest test được. Dữ liệu sinh ra (session, dump, kết quả) nằm trong `tests/loadtest/` (đã git-ignore); báo cáo commit vào `docs/loadtest/`.

**Tech Stack:** k6 (`grafana/k6:0.54.0` qua Docker), PostgreSQL 16 (`postgres:16-alpine`), Node ESM script (`pg`, `dotenv`, `bcryptjs` đã có), Vitest, Prometheus + Grafana (profile `monitoring`).

**Spec:** `docs/superpowers/specs/2026-11-13-load-capacity-design.md`

## Global Constraints

- Không thêm dependency npm. k6 chỉ chạy qua Docker image `grafana/k6:0.54.0`.
- Không sửa `compose.yml`; mọi thứ của tải nằm trong `compose.loadtest.yml`.
- `postgres-load`: `postgres:16-alpine`, cổng host `127.0.0.1:5433`, `cpus: 1`, `mem_limit: 4g`, `shared_preload_libraries=pg_stat_statements`, `max_connections=225`.
- Container app khi đo: `cpus: 1`, `mem_limit: 2g`, `APP_ENV=staging`, `CODEDEV_ENV_FILE=.env.loadtest`.
- Ngưỡng: p95 đọc < **800 ms**, p95 ghi < **1 500 ms**, lỗi < **1%**; 429 đếm riêng, không là lỗi. N = bậc VU cao nhất mà cả ba còn đạt trong trọn bậc.
- Stress: tăng **50 VU mỗi 2 phút**. Soak: **70% N, 30 phút**. Spike: **0 → 2×N trong 30 s, giữ 2 phút**. Smoke: **5 VU, 1 phút**.
- Tỷ lệ hành trình: khách **30%**, học viên **50%**, xã hội **15%**, lập trình **5%**; nghỉ **3–10 s** ngẫu nhiên giữa thao tác.
- Nút thắt: endpoint có p95 > **2×** ngưỡng lớp của nó ở mức N.
- Lần chạy **không hợp lệ** khi CPU máy chạy k6 > **80%** (trung bình 1 phút bất kỳ).
- User tải: username `lt_00001` …, email `lt_00001@loadtest.codedev.test`, mật khẩu từ `LOADTEST_PASSWORD` trong env file. Mặc định **5 000** user.
- Script ghi DB từ chối chạy khi URL trùng `DATABASE_URL` của `.env.production` hoặc `.env.local`; đích không phải local cần `--yes` (giống `scripts/db-anonymize.mjs`).
- Thao tác trên Neon (tạo/xoá nhánh, đổi CU, migration, `CREATE EXTENSION`) **không** nằm trong code; chỉ là bước runbook, người chạy làm tay sau khi chủ dự án đồng ý.
- Không thêm cơ chế bypass rate limit vào app.
- Khách **không** xem ranking: `/ranking` và `GET /api/ranking` cần đăng nhập. Ranking chuyển sang hành trình học viên (sửa spec §5.4 ở Task 8).

## Review Focus

1. **Session hết hạn giữa chừng** (access 15 phút): VU phải refresh rồi đi tiếp, không đếm 401 thành lỗi hàng loạt. → test `needsRefresh` ở Task 4, smoke với `AUTH_ACCESS_TOKEN_TTL_SECONDS=60` ở Task 5.
2. **Server action trả 200 nhưng `success:false`**, hoặc id action cũ sau khi build lại (Next trả 404 / "Server action not found"): phải tính là lỗi, không phải thành công. → test `parseActionResponse` ở Task 4.
3. **Máy k6 nghẽn** làm N giả: báo cáo phải đánh dấu lần chạy không hợp lệ. → test `runValidity` ở Task 7.
4. **Seed hoặc reset chạy nhầm DB dev/production.** → test `assertSafeTarget` ở Task 2.
5. **429 bị trộn vào lỗi** (hoặc bị bỏ qua hẳn): phải đếm riêng và vẫn có trong báo cáo. → test `classifyResponse` ở Task 4, test báo cáo ở Task 7.

---

### Task 1: Hạ tầng Docker cho tải

**Files:**
- Create: `compose.loadtest.yml`
- Create: `.env.loadtest.example`
- Modify: `.gitignore` (thêm `!.env.loadtest.example` ngay dưới `!.env.example`)
- Modify: `package.json` (scripts)

**Interfaces:**
- Produces: service `postgres-load` (mạng `backend`, host `localhost:5433`, volume `postgres-load-data`, bind `./tests/loadtest:/dumps`); service `k6` (profile `loadtest`, mạng `backend` + `monitoring`, bind `./loadtest:/scripts:ro`, `./tests/loadtest:/data`, env `BASE_URL=http://app:3000`, `K6_PROMETHEUS_RW_SERVER_URL=http://prometheus:9090/api/v1/write`, `K6_PROMETHEUS_RW_TREND_STATS=p(95),p(99),avg`); `prometheus.command` thêm `--web.enable-remote-write-receiver`; `app.cpus/mem_limit` như Global Constraints.
- Produces: npm script `"load:compose": "docker compose -f compose.yml -f compose.loadtest.yml --env-file .env.loadtest"` (các task sau gọi `npm run load:compose -- <args>`).

- [ ] **Step 1: Viết `compose.loadtest.yml`** với các service trên, cả `postgres-load` và `k6` đều `profiles: [loadtest]`. `postgres-load` có healthcheck `pg_isready`, `command: ["postgres", "-c", "shared_preload_libraries=pg_stat_statements", "-c", "max_connections=225"]`.
- [ ] **Step 2: Viết `.env.loadtest.example`**: mọi khoá `.env.local` cần cho app container, với `DATABASE_URL=postgres://postgres:<pw>@postgres-load:5432/loadtest_run`, `LOADTEST_DATABASE_URL=postgres://postgres:<pw>@localhost:5433/loadtest_base` (cho script trên host), `LOADTEST_PASSWORD=`, `POSTGRES_LOAD_PASSWORD=`, `PUSHER_*`/`BEAMS_*`/`CLOUDINARY_*` rỗng, `NEXTAUTH_URL=http://localhost:3000`. Mỗi khoá có comment một dòng.
- [ ] **Step 3: Kiểm tra cấu hình**

Run: `cp .env.loadtest.example .env.loadtest` (điền mật khẩu), rồi `npm run load:compose -- --profile app --profile loadtest --profile monitoring config --quiet`
Expected: exit 0, không cảnh báo biến thiếu.

- [ ] **Step 4: Khởi động DB và tạo `loadtest_base`**

Run: `npm run load:compose -- --profile loadtest up -d postgres-load`, rồi `npm run load:compose -- exec postgres-load psql -U postgres -c "CREATE DATABASE loadtest_base" -c "\c loadtest_base" -c "CREATE EXTENSION pg_stat_statements" -c "SELECT extname FROM pg_extension"`
Expected: có dòng `pg_stat_statements`.

- [ ] **Step 5: Chạy migration lên `loadtest_base`**

Run: `DATABASE_URL=postgres://postgres:<pw>@localhost:5433/loadtest_base node db/tools/migrate.mjs`
Expected: áp tới `20261113_027`, lần chạy thứ hai báo không còn migration chờ.

- [ ] **Step 6: Commit**

```bash
git add compose.loadtest.yml .env.loadtest.example .gitignore package.json
git commit -m "chore(loadtest): docker stack for load runs"
```

---

### Task 2: Seed dữ liệu tổng hợp

**Files:**
- Create: `scripts/loadtest/target.mjs`
- Create: `scripts/loadtest/seedPlan.mjs`
- Create: `scripts/loadtest/seed.mjs`
- Test: `__tests__/loadtest/seedPlan.test.js`
- Modify: `package.json` (`"load:seed": "node scripts/loadtest/seed.mjs"`)

**Interfaces:**
- Produces: `loadEnvFile(file: string) → object` và `assertSafeTarget(url: string, { root: string, confirmed: boolean }) → void` (ném `Error` khi: URL trùng `DATABASE_URL` của `.env.production`/`.env.local`; host local (`localhost`/`127.0.0.1`/`postgres-load`) mà tên DB không bắt đầu bằng `loadtest`; host khác mà thiếu `confirmed`) trong `target.mjs`. Task 3, 6 dùng lại.
- Produces: `seedPlan({ users: number, courseIds: string[], seed: number }) → { users: Array<{ index, username, email, courses: string[], expEntries: number[], pointEntries: number[], friends: number[], pending: number[], chats: number[] }> }` — tất định theo `seed`.
- Produces: file `tests/loadtest/users.json`: `Array<{ username, publicId }>`.
- CLI: `node scripts/loadtest/seed.mjs --env .env.loadtest [--url <db url>] [--users 5000] [--reset] [--yes]`. Mặc định đích là `LOADTEST_DATABASE_URL`.

- [ ] **Step 1: Viết test thất bại**

```js
// __tests__/loadtest/seedPlan.test.js
import { seedPlan } from "@/scripts/loadtest/seedPlan.mjs";
import { assertSafeTarget } from "@/scripts/loadtest/target.mjs";

it("plans deterministic, well-formed users", () => {
    const a = seedPlan({ users: 50, courseIds: ["c1", "c2", "c3", "c4"], seed: 7 });
    expect(a).toEqual(seedPlan({ users: 50, courseIds: ["c1", "c2", "c3", "c4"], seed: 7 }));
    expect(a.users[0].username).toBe("lt_00001");
    expect(a.users[49].email).toBe("lt_00050@loadtest.codedev.test");
    for (const u of a.users) {
        expect(u.courses).toHaveLength(3);
        expect(new Set(u.courses).size).toBe(3);
        expect(u.friends).not.toContain(u.index);
        expect(u.pending.some((p) => u.friends.includes(p))).toBe(false);
    }
});

it("makes each friendship once per pair", () => {
    const { users } = seedPlan({ users: 200, courseIds: ["c1", "c2", "c3"], seed: 1 });
    const pairs = users.flatMap((u) => [...u.friends, ...u.pending].map((f) => [Math.min(u.index, f), Math.max(u.index, f)].join("-")));
    expect(new Set(pairs).size).toBe(pairs.length);
});

it("refuses dev and production databases", () => {
    const root = process.cwd();
    expect(() => assertSafeTarget("postgres://x@localhost:5432/codedev", { root, confirmed: true })).toThrow(/loadtest/);
    expect(() => assertSafeTarget("postgres://u:p@ep-x.neon.tech/neondb", { root, confirmed: false })).toThrow(/--yes/);
    expect(() => assertSafeTarget("postgres://u:p@localhost:5433/loadtest_base", { root, confirmed: false })).not.toThrow();
});
```

Lượng mỗi user (cố định trong `seedPlan`): 3 khoá, 20 mục exp, 10 mục point, 5 bạn (accepted), 2 lời mời pending, 3 hội thoại 1-1 với bạn. Cặp bạn bè chỉ sinh từ phía `index` nhỏ hơn.

- [ ] **Step 2: Chạy test, thấy fail**

Run: `npx vitest run __tests__/loadtest/seedPlan.test.js`
Expected: FAIL, không tìm thấy module.

- [ ] **Step 3: Viết `target.mjs` và `seedPlan.mjs`.** PRNG tất định (mulberry32 theo `seed`), không dùng `Math.random`.
- [ ] **Step 4: Chạy test, thấy pass.** Run như Step 2. Expected: PASS.
- [ ] **Step 5: Viết `seed.mjs`.** Theo cách của `scripts/db-anonymize.mjs` (`createRequire`, `pg.Client`, `dotenv`). Đọc `courseIds` từ `catalog.course` (dùng các khoá có từ `db/seeds`). Với mỗi lô 500 user, một transaction:
  - `public.sign_up(id, ulid(), username, email, 'Load', 'Tester', <bcrypt hash>)`. `id` sinh như `services/auth.service.js` đang sinh khi đăng ký (đọc file đó). Hash `LOADTEST_PASSWORD` **một lần** (`bcryptjs`, cost như app).
  - `UPDATE identity.users SET email_verified = true`; ghi onboarding ở trạng thái `completed` (xem bảng có `chk_onboarding_completed_at` trong `db/schema.sql`) để `/home` không chuyển về `/onboarding`.
  - `public.register_course(publicId, courseId)` cho từng khoá; `public.post_exp(...)` / `public.post_points(...)` cho từng mục, `idempotency_key = 'lt:<username>:<kind>:<n>'`.
  - `community.friend` (accepted / pending), `community.conversation` + `conversation_member` + 20 `chat_message` mỗi hội thoại (schema ở `db/migrations/20261111_025_chat.sql`).
  - `--reset`: xoá user `lt_%` (cascade) trước khi seed; không có `--reset` mà đã có `lt_%` thì dừng với thông báo.
  - Cuối: ghi `tests/loadtest/users.json`, in tổng số dòng mỗi bảng và thời gian.
- [ ] **Step 6: Chạy thật trên `loadtest_base`**

Run: `npm run load:seed -- --env .env.loadtest --users 500`
Expected: in số dòng (500 user, 1 500 đăng ký, 10 000 exp…); chạy lại không `--reset` thì dừng; với `--reset` thì chạy lại được.

- [ ] **Step 7: Commit**

```bash
git add scripts/loadtest/target.mjs scripts/loadtest/seedPlan.mjs scripts/loadtest/seed.mjs __tests__/loadtest/seedPlan.test.js package.json
git commit -m "feat(loadtest): synthetic seed for load users"
```

---

### Task 3: Session và id server action

**Files:**
- Create: `scripts/loadtest/http.mjs`
- Create: `scripts/loadtest/sessions.mjs`
- Create: `scripts/loadtest/actions.mjs`
- Test: `__tests__/loadtest/http.test.js`
- Test: `__tests__/loadtest/actions.test.js` (+ fixture `__tests__/loadtest/fixtures/server-reference-manifest.json`)
- Modify: `package.json` (`load:sessions`, `load:actions`)

Quyết định của plan (spec §6 để ngỏ cách tạo session): session lấy bằng **đăng nhập thật qua HTTP** (`GET /api/auth/csrf` rồi `POST /api/auth/callback/credentials`), không tự mã hoá JWT. Shape cookie vì thế luôn đúng với app. Rate limit đăng nhập (10/phút/IP) được tôn trọng bằng `x-forwarded-for` riêng cho mỗi user. Cách này chỉ dùng được ở local, vì local không có header IP tin cậy. Pha Vercel lấy session từ app local trỏ cùng DB và cùng `NEXTAUTH_SECRET` (runbook, Task 8).

**Interfaces:**
- Produces: `parseSetCookies(setCookie: string[]) → Record<string,string>` và `cookieHeader(jar: Record<string,string>) → string` trong `http.mjs`.
- Produces: `tests/loadtest/sessions.json`: `Array<{ username, publicId, ip: string, cookies: Record<string,string> }>` (`ip` là `10.x.y.z` duy nhất mỗi user, VU dùng lại làm `x-forwarded-for`).
- Produces: `mapActions(manifest: object, names: string[]) → Record<string, { id: string, workers: string[] }>`, ném lỗi nêu tên action không tìm thấy.
- Produces: `tests/loadtest/actions.json`, các tên: `recordLessonVisitAction`, `submitQuizAction`, `submitLessonAction`, `registerCourseAction`, `sendFriendRequestAction`, `respondFriendRequestAction`, `sendMessageAction`, `queueCodeRunAction`.
- CLI: `sessions.mjs --env <file> --base <url> --count <k> [--concurrency 8]`; `actions.mjs <đường dẫn manifest>`.

- [ ] **Step 1: Lấy fixture manifest thật.** Run: `npm run build`, rồi chép `.next/server/server-reference-manifest.json` sang fixture, bỏ bớt entry chỉ giữ các action trên. Ghi lại một dòng trong test: Next bản nào sinh ra fixture.
- [ ] **Step 2: Viết test thất bại**

```js
// __tests__/loadtest/http.test.js
it("keeps the last value per cookie name and drops cleared cookies", () => {
    const jar = parseSetCookies([
        "next-auth.session-token=abc; Path=/; HttpOnly",
        "cd_refresh=r1; Path=/; HttpOnly; SameSite=Strict",
        "next-auth.session-token.0=; Max-Age=0; Path=/",
    ]);
    expect(jar).toEqual({ "next-auth.session-token": "abc", cd_refresh: "r1" });
    expect(cookieHeader(jar)).toBe("next-auth.session-token=abc; cd_refresh=r1");
});

// __tests__/loadtest/actions.test.js
it("maps every needed action to its id", () => {
    const map = mapActions(fixture, ["submitQuizAction", "sendMessageAction"]);
    expect(map.submitQuizAction.id).toMatch(/^[0-9a-f]{40,}$/);
    expect(map.sendMessageAction.workers.length).toBeGreaterThan(0);
});
it("names the missing action", () => {
    expect(() => mapActions(fixture, ["nopeAction"])).toThrow(/nopeAction/);
});
```

- [ ] **Step 3: Chạy test, thấy fail.** Run: `npx vitest run __tests__/loadtest/http.test.js __tests__/loadtest/actions.test.js`. Expected: FAIL.
- [ ] **Step 4: Viết `http.mjs`, `actions.mjs`** (tên export đọc từ trường tên export của manifest; nếu bản Next này không ghi tên, map qua module của từng file `actions/*.actions.js`).
- [ ] **Step 5: Chạy test, thấy pass.**
- [ ] **Step 6: Viết `sessions.mjs`.** Đọc `users.json`, đăng nhập `count` user đầu với `concurrency` song song, mỗi user một `ip`; user nào không lấy được cookie session thì báo tên và dừng với exit 1.
- [ ] **Step 7: Chạy thật.** Dựng app: `npm run load:compose -- --profile app --profile loadtest up -d --build app` (trước đó tạo DB `loadtest_run` từ `loadtest_base` bằng `CREATE DATABASE loadtest_run TEMPLATE loadtest_base`, chạy tay lần này; Task 6 tự động hoá bước này). Chép manifest từ container: `docker compose ... cp app:/app/.next/server/server-reference-manifest.json tests/loadtest/`. Run: `npm run load:actions -- tests/loadtest/server-reference-manifest.json` và `npm run load:sessions -- --env .env.loadtest --base http://localhost:3000 --count 20`.
Expected: `actions.json` đủ 8 tên; `sessions.json` 20 dòng, mỗi dòng có cookie session và `cd_refresh`.
- [ ] **Step 8: Commit**

```bash
git add scripts/loadtest/http.mjs scripts/loadtest/sessions.mjs scripts/loadtest/actions.mjs __tests__/loadtest package.json
git commit -m "feat(loadtest): mint sessions by signing in and map server action ids"
```

---

### Task 4: Thư viện k6

**Files:**
- Create: `loadtest/k6/lib/pure.js`
- Create: `loadtest/k6/lib/config.js`
- Create: `loadtest/k6/lib/client.js`
- Test: `__tests__/loadtest/k6pure.test.js`

**Interfaces:**
- Produces (`pure.js`, không import `k6/*`):
  - `parseActionResponse(status: number, body: string) → { ok: boolean, data?: any, message?: string }`. Body RSC: tìm dòng bắt đầu bằng `1:` và `JSON.parse` phần sau; `ok` chỉ khi `status === 200` và `data.success === true`.
  - `classifyResponse(status: number, actionOk?: boolean) → "ok" | "limited" | "error"`: 429 → `limited`; ≥500, 0 (timeout), 404, hoặc `actionOk === false` → `error`.
  - `needsRefresh(status: number, body: string) → boolean`: 401, hoặc 200 mà là redirect về trang đăng nhập.
  - `pickJourney(r: number, weights: Record<string, number>) → string` (`r` ∈ [0,1)).
  - `stageOf(elapsedMs: number, stageMs: number) → number`.
  - `THRESHOLDS = { readP95: 800, writeP95: 1500, errorRate: 0.01, bottleneckFactor: 2 }`, `WEIGHTS = { guest: 0.3, learner: 0.5, social: 0.15, coder: 0.05 }`, `THINK_MS = [3000, 10000]`, `STAGE_MS = 120000`, `STAGE_VUS = 50`.
- Produces (`client.js`, dùng `k6/http`): `createClient({ baseUrl, session?, actions })` trả về `{ get(path, endpoint), action(name, pagePath, args, endpoint), think() }`. Mỗi request gắn tag `endpoint`, `class` (`read`/`write`), `journey`, `stage`; gửi `x-forwarded-for: session.ip`; giữ cookie của VU; khi `needsRefresh` thì `POST /api/auth/refresh` (header `Idempotency-Key` ngẫu nhiên 32 ký tự `[A-Za-z0-9]`, `Origin: <BASE_URL>`; giữ nguyên key khi thử lại sau 503) rồi thử lại request một lần. Action: `POST pagePath`, header `Next-Action: <id>`, `Accept: text/x-component`, `Content-Type: text/plain;charset=UTF-8`, body `JSON.stringify(args)`. Ghi Counter `limited` và `errors` (tag như trên), Rate `failed_requests`.

- [ ] **Step 1: Lấy một response action thật làm fixture.** Với app của Task 3 đang chạy và một cookie từ `sessions.json`, gọi `submitQuizAction` bằng `curl` theo đúng header trên; lưu body vào `__tests__/loadtest/fixtures/action-ok.txt`. Gọi thêm một id sai, lưu `action-missing.txt` kèm status.
- [ ] **Step 2: Viết test thất bại**

```js
it("reads the action result and treats success:false as failure", () => {
    expect(parseActionResponse(200, okFixture).ok).toBe(true);
    expect(parseActionResponse(200, '0:{"a":"$@1"}\n1:{"success":false,"status":429,"message":"slow"}').ok).toBe(false);
    expect(parseActionResponse(404, missingFixture).ok).toBe(false);
});
it("keeps 429 apart from errors", () => {
    expect(classifyResponse(429)).toBe("limited");
    expect(classifyResponse(200, false)).toBe("error");
    expect(classifyResponse(0)).toBe("error");
    expect(classifyResponse(200, true)).toBe("ok");
});
it("asks for a refresh on 401 only", () => {
    expect(needsRefresh(401, "")).toBe(true);
    expect(needsRefresh(403, "")).toBe(false);
});
it("picks journeys by weight and buckets stages", () => {
    expect(pickJourney(0.1, WEIGHTS)).toBe("guest");
    expect(pickJourney(0.79, WEIGHTS)).toBe("learner");
    expect(pickJourney(0.96, WEIGHTS)).toBe("coder");
    expect(stageOf(239_999, STAGE_MS)).toBe(1);
});
```

- [ ] **Step 3: Chạy test, thấy fail.** Run: `npx vitest run __tests__/loadtest/k6pure.test.js`.
- [ ] **Step 4: Viết `pure.js`, `config.js` (đọc `__ENV.BASE_URL`, `__ENV.PROFILE`, `__ENV.N`, mở `/data/sessions.json` và `/data/actions.json` bằng `SharedArray`/`open`), `client.js`.**
- [ ] **Step 5: Chạy test, thấy pass.**
- [ ] **Step 6: Commit**

```bash
git add loadtest/k6/lib __tests__/loadtest/k6pure.test.js __tests__/loadtest/fixtures
git commit -m "feat(loadtest): k6 client with sessions, refresh and server actions"
```

---

### Task 5: Hành trình và profile k6

**Files:**
- Create: `loadtest/k6/journeys/guest.js`, `learner.js`, `social.js`, `coder.js`
- Create: `loadtest/k6/main.js`
- Create: `loadtest/k6/coderun.js`

**Interfaces:**
- Consumes: `createClient`, `pickJourney`, hằng số từ Task 4.
- Produces: mỗi file hành trình `export default function (client, ctx)`; `ctx` có `courseIds`, `users` (danh sách publicId để chọn bạn/người nhận).
- Hành trình (từ khảo sát route; endpoint tag = đường dẫn mẫu, ví dụ `/api/course/course-details`):
  - **guest:** `GET /`, `/course`, `/api/course/courses?limit=20`, `/api/course/filters`, `/course/:id`, `/api/course/course-details?courseId=`, `/api/course/rating?courseId=`, `/api/course/comments?courseId=`, `/roadmap`, `/api/roadmap/list`.
  - **learner:** `/api/user/me`, `/learning`, `/api/user/course-progress`, `/learning/:id?lesson=`, `/api/course/learning?lessonId=`, `/api/user/learning-progress?courseId=`, action `recordLessonVisitAction`; khi lesson có quiz: `/api/challenges/:id/quiz` rồi `submitQuizAction`; `submitLessonAction`; thỉnh thoảng (10%) `registerCourseAction` trên `/course/:id`; `/ranking`, `/api/ranking?board=overall&period=all`, `/api/ranking/me`.
  - **social:** `/contact`, `/api/friends`, `/api/friends/invitations?direction=received`, `/api/friends/counts`, action `sendFriendRequestAction(publicId)` hoặc `respondFriendRequestAction({ userId, accept: true })` trên `/contact`; `/messages`, `/api/chat/conversations?tab=all`, `/api/chat/conversations/:id/messages`, action `sendMessageAction({ conversationId, clientId: uuid, body })` trên `/messages/:id`.
  - **coder:** `/learning/:id?lesson=<lesson có coding>`, `/api/challenges/:id/workspace`, action `queueCodeRunAction({ challengeId, code, kind: "manual" })`, poll `GET /api/code-runs/:runId` mỗi 1,5 s trong 20 s đầu rồi 3 s (±15%), tối đa 6 phút; thời gian tới khi xong ghi vào Trend `coderun_total_ms`.
  - id khoá/lesson/challenge lấy một lần trong `setup()` từ `/api/course/courses` và `/api/course/course-details` (không đọc DB trong k6).
- `main.js` chọn scenario theo `__ENV.PROFILE`: `smoke` (5 VU, 1m), `stress` (`ramping-vus`, mỗi bậc +50 VU giữ 2m tới `__ENV.MAX_VUS`, mặc định 3000), `soak` (`constant-vus` = round(0.7×`__ENV.N`), 30m), `spike` (0 → 2×`__ENV.N` trong 30s, giữ 2m, về 0 trong 30s). Threshold dừng khẩn: `failed_requests: rate<0.2` với `abortOnFail`, `delayAbortEval: 2m`. N không tính ở đây mà ở Task 7.
- `coderun.js`: `ramping-arrival-rate` chỉ hành trình coder, tăng 1 run/giây mỗi 2 phút tới `__ENV.MAX_RATE` (mặc định 10).

- [ ] **Step 1: Viết bốn hành trình và `main.js`.**
- [ ] **Step 2: Smoke với access ngắn** — đặt `AUTH_ACCESS_TOKEN_TTL_SECONDS=60` trong `.env.loadtest`, khởi động lại app, tạo lại `sessions.json` (20).

Run: `npm run load:compose -- --profile loadtest run --rm -e PROFILE=smoke k6 run --out json=/data/smoke/k6.json.gz /scripts/k6/main.js`
Expected: mọi `check` pass, `failed_requests` = 0, có ít nhất một request `POST /api/auth/refresh` 200, không có 401 trong số request cuối của mỗi VU. Bỏ `AUTH_ACCESS_TOKEN_TTL_SECONDS` sau bước này.

- [ ] **Step 3: Viết `coderun.js`; chạy với `MAX_RATE=2` trong 4 phút.** Expected: `coderun_total_ms` có giá trị, không có run nào kẹt quá 6 phút.
- [ ] **Step 4: Commit**

```bash
git add loadtest/k6
git commit -m "feat(loadtest): k6 journeys and run profiles"
```

---

### Task 6: Lấy mẫu metric và chạy một lần đo

**Files:**
- Create: `scripts/loadtest/sample.mjs`
- Create: `scripts/loadtest/samplePure.mjs`
- Create: `scripts/loadtest/run.mjs`
- Test: `__tests__/loadtest/samplePure.test.js`
- Modify: `package.json` (`"load:run": "node scripts/loadtest/run.mjs"`)

**Interfaces:**
- Consumes: `assertSafeTarget`, `loadEnvFile` (Task 2).
- Produces: `cpuPercent(prev: os.CpuInfo[], cur: os.CpuInfo[]) → number` (0–100, gộp mọi lõi) và `parseDockerStats(line: string) → { name, cpu: number, memMb: number }` trong `samplePure.mjs`.
- Produces: thư mục chạy `tests/loadtest/runs/<yyyymmdd-hhmm>-<env>-<profile>/` gồm `k6.json.gz`, `summary.json`, `samples.ndjson` (mỗi dòng `{ t, kind: "host"|"docker"|"db", ... }`), `statements.json` (top 20 `pg_stat_statements` theo `total_exec_time`: `query, calls, mean_exec_time, total_exec_time, rows`), `meta.json` (`{ env, profile, commit, users, sessions, startedAt, endedAt, inngest: "inline"|"server" }`).
- Sampler: host CPU mỗi 5 s; `docker stats --no-stream --format "{{json .}}"` cho app và `postgres-load` mỗi 5 s; DB mỗi 15 s: số connection theo `state` (`pg_stat_activity`), số khoá đang chờ (`pg_locks` `NOT granted`), outbox chờ (bảng mà `sessionDb.claimOutbox` đọc), `code_runs` theo status, dead letter chưa xử lý (bảng của `db/deadLetter.db.js`).
- `run.mjs --env .env.loadtest --profile <p> --inngest inline|server [--n <N>] [--max-vus 3000] [--sessions 3000]` làm theo thứ tự: (1) `DROP DATABASE IF EXISTS loadtest_run` + `CREATE DATABASE loadtest_run TEMPLATE loadtest_base` (qua `exec postgres-load psql`; app phải dừng trước để không giữ connection), (2) khởi động app, chờ `/api/health` 200, (3) chép manifest + `load:actions`, (4) `load:sessions`, (5) `pg_stat_statements_reset()`, bật sampler, (6) chạy k6 với `--out json=` và `--out experimental-prometheus-rw`, `--summary-export`, (7) dừng sampler, snapshot statements, ghi `meta.json`, (8) gọi `report.mjs`. Bước nào lỗi thì dừng, giữ thư mục chạy.

- [ ] **Step 1: Viết test thất bại**

```js
it("computes busy percent across cores", () => {
    const prev = [{ times: { user: 100, nice: 0, sys: 0, idle: 900, irq: 0 } }];
    const cur = [{ times: { user: 150, nice: 0, sys: 0, idle: 950, irq: 0 } }];
    expect(cpuPercent(prev, cur)).toBe(50);
});
it("reads docker stats json", () => {
    const line = '{"Name":"codedev-app-1","CPUPerc":"87.50%","MemUsage":"512MiB / 2GiB"}';
    expect(parseDockerStats(line)).toEqual({ name: "codedev-app-1", cpu: 87.5, memMb: 512 });
});
```

- [ ] **Step 2: Chạy test, thấy fail.** Run: `npx vitest run __tests__/loadtest/samplePure.test.js`.
- [ ] **Step 3: Viết `samplePure.mjs`, `sample.mjs`, `run.mjs`.**
- [ ] **Step 4: Chạy test, thấy pass.**
- [ ] **Step 5: Chạy đầu-cuối smoke.** Run: `npm run load:run -- --env .env.loadtest --profile smoke --inngest inline --sessions 20`. Expected: thư mục chạy đủ 5 file; `samples.ndjson` có cả ba `kind`; `statements.json` 20 dòng.
- [ ] **Step 6: Commit**

```bash
git add scripts/loadtest/sample.mjs scripts/loadtest/samplePure.mjs scripts/loadtest/run.mjs __tests__/loadtest/samplePure.test.js package.json
git commit -m "feat(loadtest): samplers and one-command load run"
```

---

### Task 7: Báo cáo và tính N

**Files:**
- Create: `scripts/loadtest/reportPure.mjs`
- Create: `scripts/loadtest/report.mjs`
- Test: `__tests__/loadtest/reportPure.test.js`
- Create: `monitoring/grafana/dashboards/codedev-loadtest.json`

**Interfaces:**
- Consumes: `THRESHOLDS`, `STAGE_MS`, `STAGE_VUS` (Task 4, import thẳng từ `loadtest/k6/lib/pure.js`).
- Produces (`reportPure.mjs`):
  - `percentile(values: number[], p: number) → number` (nearest-rank).
  - `aggregateStages(points: Iterable<{ stage, cls: "read"|"write", endpoint, ms, outcome: "ok"|"limited"|"error" }>) → Map<stage, { vus, read: number[], write: number[], errors, limited, total, byEndpoint: Map<string, number[]> }>`.
  - `computeN(stages, thresholds) → { n: number | null, breakStage: number | null, reason: string | null }`: N = `vus` của bậc cao nhất mà mọi bậc tới nó đều đạt; `reason` nêu ngưỡng gãy đầu tiên (`"read p95 912 ms > 800"`).
  - `bottlenecks(stageAtN, thresholds) → Array<{ endpoint, cls, p95 }>` (p95 > 2× ngưỡng lớp).
  - `runValidity(hostSamples: Array<{ t, cpu }>) → { valid: boolean, worstMinuteCpu: number }`.
- `report.mjs <runDir>`: đọc `k6.json.gz` dạng stream (`zlib` + `readline`), chỉ lấy điểm `http_req_duration` có tag, cộng `samples.ndjson`, `statements.json`, `meta.json`; ghi `docs/loadtest/<yyyy-mm-dd>-<env>-<profile>.md` theo §5.7 spec: N, điểm gãy + lý do, hợp lệ hay không, bảng p50/p95/p99 theo endpoint ở mức N, số 429 theo endpoint, top 10 query, đỉnh CPU/RAM app và DB, đỉnh connection, hàng đợi lớn nhất, và giả định (`meta.json`, tỷ lệ hành trình, lượng seed). Profile khác `stress` thì bỏ phần N, giữ phần còn lại.
- Dashboard: một dashboard Prometheus 4 panel — VU (`k6_vus`), RPS (`rate(k6_http_reqs_total[1m])`), p95 theo `class` (`k6_http_req_duration_p95`), tỷ lệ lỗi (`k6_failed_requests_rate`) — theo cách provisioning trong `monitoring/grafana/provisioning/dashboards/dashboards.yml`.

- [ ] **Step 1: Viết test thất bại**

```js
const pts = (stage, cls, ms, n, outcome = "ok") => Array.from({ length: n }, () => ({ stage, cls, endpoint: "/x", ms, outcome }));

it("finds N at the last stage that holds every threshold", () => {
    const stages = aggregateStages([
        ...pts(0, "read", 200, 100), ...pts(0, "write", 400, 20),
        ...pts(1, "read", 500, 100), ...pts(1, "write", 900, 20),
        ...pts(2, "read", 950, 100), ...pts(2, "write", 900, 20),
    ]);
    expect(computeN(stages, THRESHOLDS)).toEqual({ n: 100, breakStage: 2, reason: "read p95 950 ms > 800" });
});
it("breaks on errors but not on 429", () => {
    const limitedOnly = aggregateStages([...pts(0, "read", 100, 90), ...pts(0, "read", 100, 10, "limited")]);
    expect(computeN(limitedOnly, THRESHOLDS).n).toBe(50);
    const errors = aggregateStages([...pts(0, "read", 100, 98), ...pts(0, "read", 100, 2, "error")]);
    expect(computeN(errors, THRESHOLDS)).toMatchObject({ n: null, breakStage: 0 });
});
it("flags endpoints over twice their class threshold", () => {
    const [stage] = aggregateStages([...pts(0, "read", 1700, 10), ...pts(0, "write", 1000, 10)]).values();
    expect(bottlenecks(stage, THRESHOLDS)).toEqual([{ endpoint: "/x", cls: "read", p95: 1700 }]);
});
it("marks a run invalid when the load machine was busy", () => {
    const busy = Array.from({ length: 12 }, (_, i) => ({ t: i * 5000, cpu: 85 }));
    expect(runValidity(busy)).toEqual({ valid: false, worstMinuteCpu: 85 });
});
```

(`vus` của bậc `s` = `(s + 1) × STAGE_VUS`.)

- [ ] **Step 2: Chạy test, thấy fail.** Run: `npx vitest run __tests__/loadtest/reportPure.test.js`.
- [ ] **Step 3: Viết `reportPure.mjs`, `report.mjs`, dashboard.**
- [ ] **Step 4: Chạy test, thấy pass.**
- [ ] **Step 5: Báo cáo từ lần smoke của Task 6.** Run: `node scripts/loadtest/report.mjs tests/loadtest/runs/<thư mục smoke>`. Expected: file trong `docs/loadtest/` có đủ các mục (không có N vì profile smoke). Mở Grafana (`npm run monitoring:up`) thấy 4 panel có dữ liệu của lần chạy.
- [ ] **Step 6: Commit** (không commit báo cáo smoke)

```bash
git add scripts/loadtest/reportPure.mjs scripts/loadtest/report.mjs __tests__/loadtest/reportPure.test.js monitoring/grafana/dashboards/codedev-loadtest.json
git commit -m "feat(loadtest): run report with N, bottlenecks and validity"
```

---

### Task 8: Runbook, sửa spec, lần stress local đầu tiên

**Files:**
- Create: `docs/loadtest/README.md`
- Modify: `docs/superpowers/specs/2026-11-13-load-capacity-design.md` (§5.4: ranking chuyển từ khách sang học viên; §5.2: session lấy bằng đăng nhập HTTP; Status)

**Interfaces:**
- Consumes: mọi lệnh `load:*` ở trên.

- [ ] **Step 1: Viết `docs/loadtest/README.md`** gồm các mục:
  - **Chuẩn bị Neon** (mỗi bước cần chủ dự án đồng ý, làm tay): tạo nhánh `loadtest` từ `develop`; đặt compute max 1 CU; `DATABASE_URL=<loadtest url> node db/tools/migrate.mjs --yes`; `CREATE EXTENSION pg_stat_statements`; `npm run load:seed -- --env .env.loadtest --url <loadtest url> --yes`; dump: `npm run load:compose -- exec postgres-load pg_dump "<loadtest url>" -Fc -f /dumps/base.dump`; restore vào `loadtest_base`: `dropdb`/`createdb` + `pg_restore --no-owner -d loadtest_base /dumps/base.dump`.
  - **Chạy local**: `smoke` → `stress` → `soak --n N` → `spike --n N`; kiểm tra Inngest trước (tên biến env production trên Vercel, không xem giá trị), ghi vào `meta.json` qua `--inngest inline|server`. Kiểm tra lesson id của các khoá đã seed có trên Sanity dataset mà `.env.loadtest` trỏ tới (mở một `/learning/:id?lesson=` bằng một session, body không rỗng).
  - **Pha Vercel Preview**: danh sách kiểm tra §5.8 spec (8 dịch vụ tách khỏi production, `DATABASE_URL` trỏ nhánh `loadtest-run-*` xác nhận qua `/api/health`, vùng `iad1`, ước lượng chi phí). Session: chạy app local với `.env.loadtest-vercel` (cùng `NEXTAUTH_SECRET` và `NEXTAUTH_URL` của preview, `DATABASE_URL` = nhánh run) rồi `load:sessions` vào app local đó; tên cookie sẽ là bản `__Secure-`/`__Host-` vì `NEXTAUTH_URL` là https. Code runner thật: `coderun.js` với `MAX_RATE` nhỏ, ghi trần số run.
  - **Đọc báo cáo** và lần chạy không hợp lệ.
- [ ] **Step 2: Sửa spec** như mục Files; Status → `implemented (local)` sau Step 3.
- [ ] **Step 3: Lần stress local đầu tiên** trên dữ liệu đầy đủ (5 000 user, đã seed vào `loadtest_base`). Run: `npm run load:run -- --env .env.loadtest --profile stress --inngest <inline|server> --sessions 3000`. Expected: báo cáo trong `docs/loadtest/` có N (hoặc ghi rõ chưa gãy tới `MAX_VUS`), lần chạy hợp lệ, có danh sách nút thắt.
- [ ] **Step 4: Commit**

```bash
git add docs/loadtest docs/superpowers/specs/2026-11-13-load-capacity-design.md
git commit -m "docs(loadtest): runbook and first local stress report"
```
