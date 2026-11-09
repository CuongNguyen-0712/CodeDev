# Blog cộng đồng CodeDev — thiết kế (brainstorming, path: architectural)

## Context

Hiện tại `/blog` (`app/(shell)/blog/page.jsx`) chỉ render empty state (`components/blog/blog.jsx`).
`future-plan.txt`: "blog post để chia sẻ kiến thức, kinh nghiệm học tập".

Đã chốt với user:
- **Ai viết:** mọi học viên chia sẻ kiến thức, kinh nghiệm cho nhau. Có thể đính kèm ảnh.
- **Kiểm duyệt (lai):** bài đầu tiên của mỗi người phải được admin duyệt. Từ bài thứ hai trở đi thì đăng ngay.
  Khi bị báo cáo, admin ẩn bài.
- **Định dạng:** Markdown, ảnh chèn giữa bài, có nút Preview.
- **Tương tác:** tag + lọc theo tag, like, bình luận, thưởng.
- **Thưởng:** EXP khi bài được đăng. Points khi bài đạt đủ like từ người khác. Points là tiền mua khoá
  học (`redeem_course_points`), nên phải chống farm.
- **Chia giai đoạn:** P1 lõi bài viết, P2 tương tác, P3 thưởng. Dùng chung một spec, mỗi giai đoạn có plan
  và PR riêng.

Lý do chọn Postgres-native: `community.comment` là review khoá học (bắt buộc `rating` 1–5,
`reference_id` = course) và `community.voting` có FK cứng sang comment, nên không dùng chung được.
Hai lựa chọn khác bị loại:
- Payload/Sanity: auth tách khỏi NextAuth, và prod dùng Sanity.
- Mở rộng bảng comment: dính `rating` và FK.

## Dữ liệu (migration mới trong `db/migrations/`, theo pattern hiện có)

**P1** `community.post`
- `id` bigint, `public_id` (`pst_` + ULID, giống `ast_` của `storage.assets`)
- `author_id` → `identity.users`
- `slug`: unique, sinh từ title + đuôi ngắn của id, không đổi khi sửa title
- `title` ≤ 150 ký tự, `excerpt` ≤ 300 ký tự (rỗng thì lấy từ body), `body_md` ≤ 50.000 ký tự
- `tags text[]`: 1–5 tag, `^[a-z0-9-]{1,30}$`, GIN index. Không tách bảng tag.
- `cover_asset_id` → `storage.assets`, nullable
- `status`: `draft | pending | published | rejected | hidden`
- `reject_reason`, `hidden_reason`, `hidden_at` (set khi ẩn, xoá khi hiện lại), `approved_by`, `approved_at`
- `published_at`, `created_at`, `updated_at`, `deleted_at` (soft delete)
- `like_count`, `comment_count` (P2 cập nhật)
- Index list: `(status, published_at DESC, id DESC) WHERE deleted_at IS NULL` cho keyset pagination.
- Index purge: `(hidden_at) WHERE status = 'hidden'`.

**P1** `community.post_asset (post_id, asset_id)`, PK cả hai cột, FK `ON DELETE CASCADE` từ post.
Ghi khi lưu bài: URL ảnh trong `body_md` (và cover) khớp với `storage.assets` purpose `blog` của chính tác giả.
Bảng này cho biết khi xoá bài thì xoá ảnh nào.

**Quy tắc tin cậy:** tác giả được coi là "trusted" khi có ít nhất một bài từng có `approved_at`. Không cần cột mới.
- Submit khi chưa trusted → `pending`.
- Submit khi đã trusted → `published`.
- Sửa bài đang published → giữ `published`.
- Sửa bài `rejected` → về `draft`, gửi lại được.

**P2**
- `community.post_like (post_id, user_id, created_at)`, PK `(post_id, user_id)`.
- `community.post_comment`: `id`, `public_id`, `post_id`, `user_id`, `body` (text thường, ≤ 2000),
  `is_hidden`, `is_deleted`, `created_at`. Comment phẳng, không lồng.
- `community.post_report (post_id, reporter_id, reason, created_at, resolved_at)`, unique `(post_id, reporter_id)`.
- Bộ đếm `like_count`/`comment_count` cập nhật trong cùng transaction.

**P3**
- EXP: thêm rule `blog.post_published` vào `profile.exp_rule`. Mở CHECK `source_type` của
  `profile.exp_transaction` thêm `blog_post` (làm giống `20261024_005_achievements.sql`).

## Quyền và chống lạm dụng

- Viết, sửa, upload ảnh, like, comment: phải đăng nhập và `identity.users.email_verified = true`.
- Quyền mới `blog.moderate`, cấp cho các role đang có `comment.moderate` (`20261103_014_rating_moderation.sql`).
- Rate limit: thêm `rateLimiters.blogWrite` (tạo bài 5/giờ, sửa 30/phút). Ảnh dùng `rateLimiters.upload`.
  P2 dùng lại `comment` và `vote`.
- Tối đa 20 ảnh mỗi bài. Chỉ nhận URL ảnh từ `mediaOrigins()`, kiểm khi lưu và khi render.

## API (`apiRoute` với `csrf` + `limiter`, zod trong `lib/validation/blog.js`, service `services/blog.service.js`)

| P | Route | Việc |
|---|---|---|
| 1 | `GET /api/blog/posts?tag=&cursor=` | list published, keyset |
| 1 | `POST /api/blog/posts` | tạo `{title, tags, body, submit}`; `submit` quyết định draft hay gửi đi |
| 1 | `PATCH`/`DELETE /api/blog/posts/[id]` | chỉ tác giả; DELETE là soft delete |
| 1 | `GET /api/blog/posts/mine` | bài của tôi, kèm status và lý do |
| 1 | `POST /api/blog/images` | multipart: `mediaService` với purpose `blog`, ≤ 5 MB, jpeg/png/gif/webp, maxSide 1600 |
| 1 | `GET /api/admin/blog?status=` / `PATCH /api/admin/blog/[id]` | `approve | reject | hide | show` kèm `reason`, audit qua `adminAudit` |
| 2 | `POST`/`DELETE /api/blog/posts/[id]/like` | không cho like bài của chính mình |
| 2 | `GET`/`POST /api/blog/posts/[id]/comments`, `DELETE /api/blog/comments/[id]` | |
| 2 | `POST /api/blog/posts/[id]/report` | |

Mỗi lần duyệt, từ chối hoặc ẩn bài thì gọi `notificationService.notify` cho tác giả. Thông báo ẩn bài ghi
lý do và ngày bài sẽ bị xoá vĩnh viễn nếu admin không hiện lại.

## Xoá vĩnh viễn bài đã ẩn quá N ngày (P1)

- **N:** hằng số `BLOG_HIDDEN_PURGE_DAYS = 30` trong `services/blog.service.js`, override được bằng env
  cùng tên. Không thêm màn hình cấu hình. User chốt con số ở bước review spec.
- **Đồng hồ:** tính từ `hidden_at`. Admin "show" đặt `hidden_at = NULL`, nên đồng hồ dừng. Ẩn lại thì đếm từ đầu.
- **Job:** thêm Inngest function `blog-purge` vào `jobs/crons.js` (cron `15 3 * * *`, `concurrency: 1`,
  `retries: 2`) và đăng ký trong `jobs/index.js`. Chia batch 50 bài mỗi step, giống `accountMaintenance`.
- **`blogService.runHiddenPurge({ limit })`**, mỗi batch là một transaction:
  1. Chọn bài `status = 'hidden' AND hidden_at < now() - N days`, `FOR UPDATE SKIP LOCKED LIMIT 50`.
  2. Lấy asset của các bài này từ `post_asset`, chỉ giữ asset không được bài nào khác tham chiếu. Đặt
     `storage.assets.deleted_at = now()`.
  3. `DELETE FROM community.post`. Like, comment, report, `post_asset` (P2) bị xoá theo cascade.
  4. Ghi outbox event `storage.purge` (đã có trong `services/authOutbox.service.js`) với danh sách file.
     Outbox xoá file sau commit, có retry, và idempotent.
  5. Revalidate `cacheTags.post(id)` và `cacheTags.blog`.
- **Không đụng ledger:** dòng `exp_transaction` và `point_transaction` của bài vẫn giữ (append-only,
  `source_id` trỏ tới id đã xoá).
- **Báo cáo:** job trả `{ purged, files }`, xem trong Inngest. Hành động ẩn vốn đã có audit.
- **Admin UI:** tab "Đã ẩn" ở `/admin/blog` hiện cột "Xoá sau X ngày".

Đây là thao tác xoá không hoàn tác được. Bài và ảnh mất vĩnh viễn, chỉ còn trong backup DB.

## Render Markdown (an toàn)

- Thêm dependency `react-markdown` + `remark-gfm`. Không có renderer Markdown nào sẵn trong repo.
- Render trong Server Component ở trang bài, nên không tốn bundle client. Trang editor dùng dynamic import
  cho phần Preview.
- **Không bật** `rehype-raw`, nên HTML thô bị bỏ qua. Giữ `urlTransform` mặc định (chặn `javascript:`).
- Component `img`: chỉ render khi `isAllowedMediaUrl(url, mediaOrigins())`.
- Component `a`: link ngoài thêm `rel="nofollow ugc noopener"`.
- Component `code`: dùng `components/ui/codeBlock.jsx`.

## Trang

- **`/blog`**: server render trang đầu, `'use cache'` + `cacheTag("blog")` theo tag. Có chip lọc tag, nút
  "Load more" là island, nút "Viết bài". Không có bài thì giữ empty state hiện tại.
- **`/blog/[slug]`**: chỉ hiện bài `published`, các trạng thái khác trả 404.
  - Cache bằng `'use cache'` + `cacheTag("post:<id>")`.
  - Thêm `cacheTags.blog` / `cacheTags.post` vào `lib/pageCache.js`. Revalidate khi publish, sửa, ẩn hoặc xoá.
  - Header gồm tác giả (avatar, link `/profile/[id]`), ngày, thời gian đọc, tag.
  - P2: like, comment, báo cáo là island React Query (pattern `queries/` + `mutations/`).
- **`/blog/new`, `/blog/[slug]/edit`** (private):
  - Title, ô nhập tag, textarea Markdown với tab Write/Preview.
  - Ảnh: nút upload và dán ảnh từ clipboard; sau upload chèn `![alt](url)` tại con trỏ.
  - Hai nút: "Lưu nháp" và "Gửi". Bài đầu thì ghi "Gửi duyệt".
- **`/blog/me`**: danh sách bài của tôi, badge trạng thái, lý do từ chối.
- **`/admin/blog`**: hàng chờ duyệt, bài bị báo cáo (P2), bài đã ẩn. Theo layout các trang admin hiện có
  (`app/admin/feedback`).
- **SEO:**
  - `generateMetadata` (canonical, OG `article`).
  - JSON-LD `BlogPosting`.
  - `metadataBase` trong `app/layout.jsx`, lấy từ `NEXTAUTH_URL`.
  - `app/sitemap.js` gồm trang public, bài published và khoá học (`getPrerenderedCourseIds`).
  - `app/robots.js` chặn `/admin`, `/studio`, `/api`, `/blog/new`, `/blog/me`.

## Thưởng (P3)

- **EXP:** `award_exp(user, 'blog.post_published', 'blog_post', post_id)` chạy lần đầu bài chuyển sang
  `published`. Idempotent theo bài. Mỗi ngày chỉ thưởng tối đa 1 bài cho mỗi người. Ẩn bài sau đó không
  thu hồi EXP.
- **Points:** khi bài đạt **10 like** từ người dùng khác (đã xác minh email), gọi
  `post_points(..., idempotency_key = 'blog-likes:<post_id>')`, chỉ một lần cho mỗi bài.
  Bài bị ẩn trước mốc này thì không nhận.
- Báo cho tác giả qua `notificationService.notifyRewards`.
- Các con số (EXP, 10 like, số points) user review ở bước spec.

## Ngoài phạm vi (YAGNI)

- Comment lồng nhau, sửa comment
- Tự ẩn bài theo số lượt báo cáo
- Tìm kiếm full-text, RSS
- Tự xoá ảnh mồ côi của bài tác giả tự xoá (soft delete) hoặc ảnh upload mà không lưu bài. Ảnh của bài
  bị purge thì có xoá.
- Tác giả sửa bài đã ẩn để gửi duyệt lại (kháng nghị)
- Lịch sử chỉnh sửa
- Lượt xem
- Theo dõi tác giả
- Link navbar: footer đã có, vẫn giữ IA "public, not listed"

## Reuse

- Upload ảnh: `services/media.service.js`, `lib/media/mediaStore.js`, `storage.assets`
- Ảnh và code: `lib/media/mediaOrigins.mjs`, `components/ui/codeBlock.jsx`
- API: `lib/routeHandler` (`apiRoute`), `lib/rateLimit.js`, `lib/authz` (`requirePermission`)
- Admin và thông báo: `services/adminAudit.service.js`, `services/notification.service.js`
- Cache: `lib/pageCache.js`, `lib/cachedData.js`
- Thưởng: `award_exp`, `post_points`
- UI: shadcn `Empty`/`Badge`/`Button`

## Kiểm thử

- **Vitest service:**
  - Quy tắc trusted: bài đầu `pending`, sau khi approve thì bài sau `published`.
  - Quyền sửa/xoá: chỉ tác giả.
  - Validate tag, độ dài, tối đa 20 ảnh, URL ảnh ngoài origin bị từ chối.
  - Purge:
    - Chỉ xoá bài `hidden` có `hidden_at` cũ hơn N ngày.
    - Bài được "show" lại không bị xoá.
    - Ảnh dùng chung với bài khác được giữ.
    - Outbox event có đúng file.
    - Chạy lại lần hai không xoá thêm gì.
  - P2: like trùng, tự like.
  - P3: thưởng idempotent, giới hạn mỗi ngày, mốc 10 like.
- **Vitest renderer (XSS):** `<script>` thô, `[x](javascript:...)`, ảnh từ origin lạ đều không ra HTML nguy hiểm.
- **Migration:** chạy `npm run db:migrate`, rồi `npm run db:compare` sạch.
- **Preview (`npm run dev`):**
  1. User A viết bài đầu, kèm ảnh dán từ clipboard.
  2. Bài ở `/blog/me` hiện badge pending; `/blog/[slug]` trả 404.
  3. Admin duyệt ở `/admin/blog`; A nhận thông báo; bài hiện ở `/blog` và lọc được theo tag.
  4. Bài thứ hai của A đăng ngay.
  5. Admin ẩn bài; bài biến mất khỏi list.
  6. Lùi `hidden_at` của bài đó quá N ngày trong DB local, rồi chạy `blog-purge` từ Inngest dev server. Bài
     và ảnh trên Payload local phải biến mất.
  7. Kiểm `view-source` (JSON-LD, OG), `/sitemap.xml`, dark mode, viewport 375px.
- **UI:** chạy `ui-consistency:finding-patterns` trước task UI đầu tiên của mỗi giai đoạn, và
  `ui-consistency:verifying` trước PR.

## Bước tiếp theo sau khi duyệt

1. Spec này (`docs/superpowers/specs/2026-11-09-community-blog-design.md`): user review.
2. Gọi `superpowers:writing-plans` cho **P1** (lõi bài viết). P2 và P3 mỗi giai đoạn một plan riêng sau khi
   P1 merge.
