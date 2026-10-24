# Master Execution Plan V1.3 — điều chỉnh theo dự án hiện tại

Nguồn: *CodeDev Master Execution Plan V1.3* và *Prompt Context + Content Generator V1.3* (24/10/2026).
File này ghi phần nào của V1.3 **đã có** trong code, phần nào **đổi cách làm** cho khớp nền tảng, và
**phần còn thiếu** theo thứ tự làm. Prompt sản xuất nội dung đã điều chỉnh: `content/PROMPT_CONTEXT.md`.

## 1. Khác biệt lớn giữa V1.3 và dự án

| V1.3 giả định | Dự án hiện tại (24/10/2026) | Điều chỉnh |
|---|---|---|
| Catalog 25 course theo kiến trúc (A1–E7), stack TS end-to-end | 46 course theo **vai trò + ngôn ngữ** (10 roadmap), 18 beginner đã viết, intermediate+ là outline | Giữ 46 course. V1.3 thành một **track kiến trúc** bổ sung: course trùng thì đổ challenge bank vào outline có sẵn, course chưa có thì tạo mới (mục 4). |
| Quiz = từng câu Đúng/Sai, 3 EXP/câu, chỉ khi đúng lần đầu | Quiz = **một challenge gồm nhiều câu** (`single_choice`, `multiple_choice`), đạt khi ≥70%, tối đa 3 lượt, EXP 5/8/12 theo độ khó, 50% nếu đạt lượt 2–3 (`docs/experience-leveling-design.md` §3) | Câu Đúng/Sai = `single_choice` 2 lựa chọn (`True`/`False`). Gom 4–6 nhận định thành một quiz challenge. Giữ mô hình EXP theo quiz challenge (đổi sang 3 EXP/câu phải chấm lại lịch sử, không đáng). |
| Course Tier 1–4 | `catalog.course.level`: beginner / intermediate / advanced / expert (+ master) | Tier 1–4 = beginner…expert; master tính như Tier 4. |
| Solve / Fix bug | `challenge.type`: `mini_coding` / `fix_bug` | Đổi tên khi viết nội dung; EXP đã trùng bảng 7.2. |
| Sandbox: cần xác nhận TS, SQL, PostgreSQL, Redis, React test | Code runner (local Docker + Vercel Sandbox `codedev-runner:v4`): JS (function, chạy cả trên browser), TS (`tsc --strict`, stdio), Python, C, C++, Java, Go, Rust, PHP, Kotlin, C#; SQL chạy bằng `sqlite3` của Python | Trả lời 2.2 #1–#5 ở mục 2. |
| Nội dung tiếng Việt | 46 course và UI đều tiếng Anh | **Cần chốt** (mục 5). Mặc định: giữ tiếng Anh cho đồng bộ. |
| `experience_transactions`, `user_experience`, `course_configs`… | `profile.exp_transaction`, `profile.info.exp/exp_level`, `profile.exp_rule`, `profile.exp_level`, `catalog.course_prerequisite` | Không đổi tên bảng; ánh xạ ở mục 3. |
| API `/api/v1/...`, `POST /internal/experience/events` | Server actions + `app/api/user/experience`, `app/api/recommendations`, `app/api/admin/experience/adjust`; EXP ghi trong cùng transaction chấm bài (`post_exp`) | Không làm event endpoint: chấm bài và cộng EXP đã cùng transaction ở server. |

## 2. Trả lời "Cần chốt" 2.2 theo năng lực có sẵn

| # | Câu hỏi | Trả lời |
|---|---|---|
| 1 | Ngôn ngữ sandbox | Đủ 11 ngôn ngữ (xem trên). Track kiến trúc dùng **TypeScript** (stdio) hoặc **JavaScript** (function mode, chạy được trên browser khi không có runner) và **SQL qua SQLite**. |
| 2 | Nhiều file hay một hàm | Một file starter; JS có `harness.js` riêng do tác giả viết. Nhiều class/hàm trong một file được. |
| 3 | PostgreSQL / Redis trong sandbox | Không. SQL cơ bản dùng SQLite; Redis mô phỏng in-memory (Map + sorted array). Challenge (*) cần `EXPLAIN` PostgreSQL (C1-S4, C1-S5, E4 pgvector) để sau. |
| 4 | Test React (Jest + Testing Library) | Không. B1 tách logic thành reducer/hook thuần. |
| 5 | Chấm test do học viên viết bằng mutant | Làm được bằng harness JS (chạy test của học viên với các mutant cài sẵn trong harness), nhưng chưa có tiền lệ. Mặc định: A4-S4 thành bài solve thường. |
| 6 | Theo dõi mở hint | Có từ P1 (`challenge.hint_views`). |
| 7–9 | E7 tách riêng; D5 Phase 3; quiz giữ Đ/S | Theo mặc định của V1.3. Multi-select thực ra **đã có** (`multiple_choice`). |
| 10 | Quyết định mở của EXP | Phần lớn đã chốt trong `docs/experience-leveling-design.md` §13. |

## 3. Hệ EXP/Level (mục 7) — đối chiếu

| Hạng mục V1.3 | Trạng thái | Ở đâu |
|---|---|---|
| Bảng 20 Level, ngưỡng EXP | Có, trùng 100% | `profile.exp_level` |
| Ledger append-only, idempotency, sàn 0 | Có | `profile.exp_transaction`, `public.post_exp` |
| Rule cấu hình không cần deploy | Có (không có cột version; đổi giá trị = sửa dòng rule, chỉ áp dụng giao dịch sau) | `profile.exp_rule` |
| Lesson 10; solve 10/20/35; fix bug 8/15/25 | Có, trùng | `lesson`, `coding.mini_coding.*`, `coding.fix_bug.*` |
| Course bonus 50/100/150/200 | Có | `course.beginner…expert` |
| Quiz Đ/S 3 EXP/câu đúng lần đầu | **Khác**: theo quiz challenge (5/8/12) | Giữ, xem mục 1 |
| Level đề xuất 1–5 / 4–9 / 8–14 / 13–20 + nhãn phù hợp | Có, biên trùng | `lib/levels.js` `courseFit` |
| Override khoảng Level theo course (E2: 3–8, E7: 6–12) | Có (P4) | `catalog.course.recommended_min_level/max_level` |
| Prerequisite | Có | `catalog.course_prerequisite`, `course.json` `prerequisites` |
| Gợi ý course có lý do | Có (v1, trọng số riêng, chưa theo điểm số 7.5) | `services/recommendation.service.js` |
| Điều chỉnh admin có lý do | Có | `app/api/admin/experience/adjust` |
| `estimatedExp` | Có (tính khi đọc) | `docs/experience-leveling-design.md` §6 |
| Điều kiện hoàn thành theo tier (≥60/70/75/80% quiz, pass mọi coding, ≥1 bài khó ở T3) | Có (P2), chỉ course khai báo `completionRules`; coding tính theo % thay vì tất cả | `public.course_completion_status` |
| Hint 3 cấp + `challenge.*.assisted` 50% | Có (P1) | `challenge.challenge_hints`, `challenge.hint_views` |
| Achievement (Bug Hunter, Self-Reliant) | Có (P3) | `profile.achievement`, `public.award_achievements` |
| Điều chỉnh theo phong độ | Thiếu; V1.3 cũng tắt lúc đầu | Bỏ qua tới khi có dữ liệu |
| Fix bug từ chối code gốc | Có gián tiếp: `verify-challenges` bắt buộc starter **fail**, nên nộp lại code gốc không bao giờ pass | Không cần code mới |
| Test ẩn | Có: `tests[].hidden` → `challenge_test_cases.is_hidden` | — |
| Không trả đáp án về client trước khi nộp | Có | — |
| Ngân hàng câu hỏi lớn hơn số câu hiển thị, xáo thứ tự | **Thiếu** | Để sau (lượt quiz cũ được chấm lại theo bộ câu hiện tại) |

## 4. Catalog V1.3 → course của dự án

| V1.3 | Course dự án | Cách làm |
|---|---|---|
| A1 Web Application Fundamentals (HTTP, CORS, cache) | Không có (web-foundations là HTML/CSS/a11y) | Course mới `web-http-fundamentals`, beginner, JavaScript |
| A2 SQL & Data Modeling | `sql-data-analysis-foundations` dạy truy vấn phân tích, không dạy constraint/transaction | Course mới `sql-data-modeling`, beginner, SQL (SQLite) |
| A3 Software Architecture Fundamentals | Không có | Course mới, beginner, TypeScript |
| A4 Testing Fundamentals | `test-automation-foundations` (đã viết), `typescript-test-design` (outline) | Bổ sung câu Đ/S + fix bug "Fix the Flaky Pipeline" vào outline `typescript-test-design` |
| B1 React + TypeScript Architecture | `typescript-react-frontend` (outline, intermediate) | Đổ challenge bank B1 vào outline |
| B2 Next.js Rendering & Caching | Không có | Course mới, intermediate, TypeScript |
| B3 NestJS Modular Monolith | Không có | Course mới, intermediate, TypeScript (module/DI viết thuần, không cài NestJS) |
| B4 API Design for Production | Gần `php-modern-apis` (khác stack) | Course mới, intermediate, TypeScript |
| B5 Authentication & Session Design | `nodejs-api-security` (outline, expert) | Đổ B5 vào outline; xem lại level (V1.3: advanced) |
| C1 PostgreSQL Performance | Không có; cần PostgreSQL (*) | Course mới; bài `EXPLAIN` để sau |
| C2 Redis Patterns | Không có | Course mới, advanced, TypeScript + Redis in-memory |
| C3 Background Jobs, C4 Consistency & Events | Không có | Course mới, Phase 3 |
| D1 Docker & CI/CD | `devops-foundations-ci-containers` (đã viết, beginner) | Bổ sung quiz scenario "Bad Release, Fast Rollback" + SBOM/secret scan |
| D2 OpenTelemetry, D4 System Design Capstone | Không có | Course mới, Phase 3 |
| D3 Load Testing | `qa-performance-reliability` (outline, advanced) | Đổ D3 vào outline |
| D5 Supply Chain Security & AI Code | Không có | Course mới, Phase 3 |
| E1 AI & LLM Foundations | Không có | Course mới, beginner, TypeScript + fake LLM |
| E2 AI-Assisted Development, E7 Agentic Coding | Không có | Course mới, intermediate |
| E3 LLM Features, E6 Agents & MCP | `nodejs-ai-engineering` (outline, advanced) | Đổ E3 vào outline; E6 course mới (expert) |
| E4 RAG & Vector Search | `python-rag-from-scratch` (đã viết, intermediate) | Đã có tương đương; pgvector (*) để sau |
| E5 LLM Eval & Guardrails | `python-ml-evaluation` là ML, không phải LLM | Course mới, advanced |

Course mới cần thêm vào `content/roadmaps.json` sau khi publish.

Số lượng theo tier: V1.3 yêu cầu 20–30 câu Đ/S + 6–9 coding mỗi course. Quy ước dự án là 1–2 challenge
mỗi lesson. Điều chỉnh: mỗi lesson 1 quiz challenge (4–6 câu Đ/S) + 0–1 coding; course đạt tổng số câu
và số coding của tier bằng cách phân bổ qua 8–15 lesson.

## 5. Quyết định cần chốt

| # | Câu hỏi | Mặc định đề xuất |
|---|---|---|
| D1 | Ngôn ngữ nội dung track kiến trúc: tiếng Việt (V1.3) hay tiếng Anh (như 46 course hiện có)? | Tiếng Anh, giữ đồng bộ UI và catalog |
| D2 | Quiz: giữ EXP theo quiz challenge hay đổi sang 3 EXP/câu đúng lần đầu? | Giữ (mục 1) |
| D3 | Điều kiện hoàn thành theo tier (P2) áp dụng cho course cũ hay chỉ course mới? | **Đã chốt 24/10**: chỉ course khai báo `completionRules`; coding giữ 5 lượt và tính theo % (cùng ngưỡng quiz) |
| D4 | Ngôn ngữ coding của track: TypeScript (cần runner) hay JavaScript (chạy cả browser)? | TypeScript; bài nào cần chạy không runner thì JavaScript |

## 6. Thứ tự thực hiện

**Platform** (mỗi mục là một thay đổi riêng, có migration + test):

- **P1. Hint 3 cấp + assisted — xong (migration `20261024_002`).** `challenges.json` `hints: [h1, h2, h3]`
  → `challenge.challenge_hints` (server-only); `openChallengeHintAction` mở lần lượt và ghi
  `challenge.hint_views`; khi pass, `awardChallengeRewards` nhân EXP 0.5 nếu đã mở cấp 3 (metadata
  `assisted: true`), points giữ nguyên. Challenge chưa có `hints` vẫn dùng hint đơn của `challengeEmbed`.
  Rollout prod: migration trước, rồi mới áp seed có `challenge_hints`.
- **P2. Điều kiện hoàn thành theo tier — xong (migration `20261024_003`).** `catalog.course.completion_rules`
  (null = mọi lesson như cũ; `{}` = mặc định theo level). `public.course_completion_status` tính tỷ lệ quiz
  đạt (`minQuizPercent`), coding pass (`minCodingPercent`, cùng mặc định 60/70/75/80) và `minHardPassed`
  (advanced trở lên 1, không vượt số bài khó có). `submit_lesson` chỉ đánh dấu hoàn thành + bonus khi đạt;
  trang học hiện khối "To complete this course". Vì lesson chỉ xong khi mọi challenge đã pass hoặc hết lượt,
  kết quả là cố định khi xong lesson cuối.
- **P3. Achievement — xong (migration `20261024_005`).** `profile.achievement` + `profile.user_achievement`;
  EXP qua `award_exp` rule `achievement.<code>` (source_type `achievement`). `public.award_achievements` chạy
  ngay sau mỗi lần thưởng challenge, cùng transaction; toast "Achievement unlocked", card Achievements ở
  trang profile. Bug Hunter: pass 5 bài fix bug (+30 EXP). Self-Reliant: pass 10 bài coding không mở hint 3
  trước (+50 EXP). Người đã đủ điều kiện từ trước nhận ở lần pass challenge kế tiếp (không backfill).
- **P4. Override khoảng Level theo course — xong (migration `20261024_004`).**
  `catalog.course.recommended_min_level/max_level` (null = theo level), `course.json` `recommendedLevel: { min, max }`;
  `recommendedLevel` / `courseFit` trong `lib/levels.js` nhận override (thẻ course và gợi ý course).

**Content** (theo pipeline `content/README.md`, prompt `content/PROMPT_CONTEXT.md`):

1. MVP: A1 `web-http-fundamentals`, A2 `sql-data-modeling`, B1 (outline `typescript-react-frontend`),
   B3 course mới.
2. AI wave 1: E1, E2 + bài "Spot the AI Mistake" trong 4 course MVP.
3. AI wave 2: E3 (outline `nodejs-ai-engineering`), E7, B5 (outline `nodejs-api-security`), C2, B2.
4. Còn lại: A3, A4, B4, C1, C3, C4, D2–D5, E5, E6.

Mỗi course: viết local, `build-course`, verify, publish local; rollout prod theo `content/README.md`
(storage trước, seed thử trên Neon branch).
