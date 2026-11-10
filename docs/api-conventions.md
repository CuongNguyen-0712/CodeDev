# API và server action: khi nào dùng cái nào

Quy ước cho mọi endpoint mới và mọi lần sửa endpoint cũ. Lý do chọn: [performance-plan.md](performance-plan.md), Phase 5.

## 1. Quy tắc chọn

Một thao tác **giữ route handler** nếu đúng ít nhất một điều:

1. Là thao tác đọc mà React Query gọi (`useQuery` / `useInfiniteQuery`). `GET` cache được (HTTP, CDN cho dữ liệu public), chạy song song, huỷ được (`AbortSignal`), retry an toàn; server action luôn là `POST`, mỗi client chạy tuần tự, không cache được.
2. Người gọi không phải UI của app: webhook, Inngest, cron, health, Pusher, NextAuth. Xác thực bằng chữ ký / secret / giao thức riêng, không qua `apiRoute`.
3. Đặt hoặc xoay cookie phiên, hoặc chạy trước khi có phiên: `auth/*`, `user/signup`, `user/sessions`, `user/accounts/[provider]`, `user/delete-unverified`.
4. Cần admin step-up (`requirePermission` / `requireRecentAuth`): toàn bộ `admin/*`. Step-up phía client hiện chỉ replay được qua axios interceptor (`lib/axios.js`, `lib/adminStepUp.js`).
5. Liên quan tiền và có idempotency key: `commerce/checkout`, `commerce/redeem`.
6. Cần ngữ nghĩa HTTP: redirect, `Cache-Control` công khai, tải file.

Còn lại là ghi chỉ UI gọi: **server action** trong `actions/*.actions.js`, bọc bằng `runAction`. Next.js tự chặn cross-origin (kiểm tra `Origin`), không phải thiết kế URL công khai, và lỗi trả về dạng giá trị, không bị redact ở production.

**Client ngoài.** Route ghi dùng cookie + `assertSameOrigin` (`lib/requestGuard.js`): cần `Origin` trong allowlist hoặc `Sec-Fetch-Site: same-origin`, nên app native không gọi được. Khi có mobile, thêm route mới với auth bằng token, gọi cùng `services/*`. Không giữ route cookie "phòng hờ".

Không làm:

- Không dùng server action để đọc. Toàn bộ thao tác đọc qua action trước đây đã chuyển sang `GET` (mục 4).
- Không đặt động từ vào URL (`/api/get/...`, `/api/post/...`). Động từ là HTTP method; URL là danh từ số nhiều (`/api/users`, `/api/challenges/:id/quiz`).
- Không gọi `db/*` từ route, action hoặc component. Đi qua `services/*`.

## 2. Route handler: `apiRoute` (`lib/routeHandler.js`)

```js
export const GET = apiRoute(async ({ req, userId, params }) => service.read(...), {
    context: "api/things",         // tên trong log lỗi
    auth: "required",              // "required" | "optional" | "none"
    allowLocked: false,            // cho tài khoản quá hạn xác minh email (plan 12.3)
    csrf: false,                   // true cho mọi ghi dùng cookie
    limiter: rateLimiters.api,     // theo user id, khách thì theo IP
    cacheControl: undefined,       // mặc định "private, no-store"
});
```

- `auth: "required"`: chưa đăng nhập thì 401.
- `auth: "optional"`: khách được đọc, `userId = null`. Access token hết hạn vẫn trả 401, để client refresh rồi gọi lại, thay vì nhận nhầm dữ liệu của khách.
- `auth: "none"`: không đọc session. Chỉ dùng cho dữ liệu giống nhau với mọi người, và chỉ khi đó mới được đặt `cacheControl: "public, s-maxage=…, stale-while-revalidate=…"`.

Envelope:

- Thành công: `{ success: true, data }`.
- Lỗi: `{ success: false, message, code? }` (`errorResponse`). Lỗi 5xx không lộ chi tiết; 429 có `code: "RATE_LIMITED"` và header `Retry-After`.

Validate input ngay tại route: id dạng `PUBLIC_ID`, cursor, `limit` có giới hạn trên.

## 3. Server action: `runAction` (`lib/serverAction.js`)

```js
'use server';
export async function submitQuizAction({ challengeId, answers }) {
    return runAction(({ userId }) => challengeService.submitQuiz({ userId, challengeId, answers }),
        { limiter: rateLimiters.quiz, context: "submitQuizAction" });
}
```

- Trả về `{ success, data }` hoặc `{ success: false, status, message }`.
- Phía client gọi qua `callAction(run)` (`lib/actionResult.js`) = `unwrapActionResult(await callWithAuthRetry(run))`, ví dụ `mutationFn: (v) => callAction(() => createPostAction(v))`. Lỗi vẫn mang `.status` / `.code` nên `onError` chạy như với route.
- Chỉ ghi. Kết quả nào trả về (ví dụ quiz state sau khi nộp) thì đưa vào cache bằng `setQueryData`, không bắt client gọi lại.

Bốn bất biến khi viết action (mỗi `export` trong file `'use server'` là một endpoint công khai):

1. **`userId` chỉ lấy từ `ctx` của `runAction`.** Tham số action không bao giờ chứa định danh người dùng.
2. **Mọi `export` đi qua `runAction`.** Không export helper, regex hay hàm chưa bọc.
3. **Không dùng `auth: false` hay `allowLocked` trong action mới.** Hiện chỉ `sendFeedbackAction` dùng `auth: false` và `updateUserProfileAction` dùng `allowLocked`.
4. **Giữ nguyên validate đầu vào của route cũ** (regex id, zod, giới hạn 1-100 uuid) trước khi gọi service, và đọc tham số bên trong handler của `runAction` để `null` / `undefined` trả 400.

`__tests__/lists/actionsGuard.test.js` kiểm hai bất biến (2 và 3): số `export async function` bằng số `runAction(` trong từng file, `auth: false` chỉ có ở `feedback.actions.js`, `allowLocked` chỉ có ở `user.actions.js`. `__tests__/lists/serverAction.test.js` kiểm `runAction` thật (401, 403, 429, `userId` của phiên).

## 4. Phân trang

Dùng cho mọi list mới, và list cũ khi được sửa tới:

- Request: `?cursor=<opaque>&limit=<≤ 50>`.
- Response: `{ items, nextCursor }`, với `nextCursor = null` ở trang cuối.
- Cursor là keyset (ví dụ `(created_at, id)`), không dùng OFFSET. Server tự mã hoá/giải mã cursor; client chỉ truyền lại nguyên chuỗi.

Đã theo contract: `GET /api/users`, `GET /api/course/comments`. Còn dùng dạng cũ (chưa đổi, vì phải sửa cả client của chúng):

- `course/courses`: `lastId`.
- `commerce/orders`, `user/experience`: `before`.
- `user/course-progress`: `nextCursor` nhưng response không có `items`.

## 5. Bản đồ endpoint sau Phase 5

| Trước | Sau |
|---|---|
| `getCodingWorkspaceAction` | `GET /api/challenges/:id/workspace` |
| `getQuizStateAction` | `GET /api/challenges/:id/quiz` (kèm câu hỏi, không kèm đáp án) |
| `getCodingHistoryAction` | `GET /api/challenges/:id/submissions` |
| `getSubmissionCodeAction` | `GET /api/challenges/:id/submissions/:submissionId` |
| `getCodeRunAction` (poll) | `GET /api/code-runs/:runId` |
| `GET /api/get/getUsersSocial?offset=` | `GET /api/users?search=&cursor=` |
| `GET /api/get/getMyFriends`, `GET /api/get/getSocial`, `POST /api/post/postCreateTeam` | xoá (không có caller) |
| `PATCH /api/user/logout` | `POST /api/auth/logout` |
| `GET /api/health` (đầy đủ, công khai) | `GET /api/health`: liveness công khai; báo cáo đầy đủ cần `Authorization: Bearer $HEALTH_TOKEN` (hoặc `CRON_SECRET`) |

### 15 handler ghi phía người học: route sang action

| Trước | Sau |
|---|---|
| `POST /api/blog/posts` | `createPostAction` (`actions/blog.actions.js`) |
| `PATCH /api/blog/posts/[id]` | `updatePostAction` |
| `DELETE /api/blog/posts/[id]` | `deletePostAction` |
| `POST /api/blog/posts/[id]/comments` | `addCommentAction` |
| `DELETE /api/blog/comments/[id]` | `deleteCommentAction` |
| `POST /api/blog/posts/[id]/report` | `reportPostAction` |
| `POST /api/blog/images` | `uploadBlogImageAction` (`actions/upload.actions.js`) |
| `PATCH /api/user/privacy` | `updatePrivacyAction` (`actions/user.actions.js`) |
| `PATCH /api/user/notifications` | `markNotificationsAction` |
| `PATCH /api/user/avatars` | `restoreAvatarAction` |
| `DELETE /api/user/avatars` | `deleteAvatarAction` |
| `POST /api/onboarding/preferences` | `saveOnboardingStepAction` (`actions/onboarding.actions.js`) |
| `PATCH /api/onboarding/preferences` | `updatePreferencesAction` |
| `POST /api/onboarding/complete` | `completeOnboardingAction` |
| `POST /api/onboarding/skip` | `skipOnboardingAction` |
| `POST` / `DELETE /api/blog/posts/[id]/like` | `setPostLikeAction` (`actions/blog.actions.js`) |

Các route `GET` của blog, user và onboarding giữ nguyên. Thiết kế đầy đủ: [2026-11-10-api-vs-action-boundary-design.md](superpowers/specs/2026-11-10-api-vs-action-boundary-design.md).
