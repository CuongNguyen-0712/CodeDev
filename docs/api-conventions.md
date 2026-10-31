# API và server action: khi nào dùng cái nào

Quy ước cho mọi endpoint mới và mọi lần sửa endpoint cũ. Lý do chọn: [performance-plan.md](performance-plan.md), Phase 5.

## 1. Quy tắc chọn

| Việc | Dùng | Vì sao |
|---|---|---|
| **Đọc dữ liệu** (mọi thứ React Query `useQuery` / `useInfiniteQuery` gọi, server component không tính) | **Route handler `GET`** trong `app/api/**`, bọc bằng `apiRoute` | `GET` cache được (HTTP, CDN cho dữ liệu public), chạy song song, huỷ được (`AbortSignal`), retry an toàn. Server action luôn là `POST`, mỗi client chạy tuần tự từng cái một, không cache được |
| **Ghi dữ liệu chỉ có UI của app gọi** (form, nút bấm: ghi danh, nộp quiz, chạy code, comment, đổi profile) | **Server action** trong `actions/*.actions.js`, bọc bằng `runAction` | Next.js tự chặn cross-origin (kiểm tra `Origin`). Không phải thiết kế URL công khai. Lỗi trả về dạng giá trị, không bị redact ở production |
| **Ghi dữ liệu là một phần của HTTP API** (admin, commerce/checkout, onboarding, quản lý tài khoản/session, signup) | **Route handler `POST`/`PATCH`/`DELETE`** + `apiRoute({ csrf: true })` | Có hợp đồng HTTP rõ ràng: test bằng `fetch`, có audit log, có thể có client ngoài |
| **Bên ngoài gọi vào** (webhook thanh toán, Sanity, Inngest, cron, Pusher auth, next-auth) | **Route handler riêng**, không qua `apiRoute` | Xác thực bằng chữ ký / secret / giao thức riêng, không dùng session cookie |

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

- Trả về `{ success, data }` hoặc `{ success: false, status, message }`. Phía client dùng `unwrapActionResult` + `callWithAuthRetry` (`lib/actionResult.js`).
- Chỉ ghi. Kết quả nào trả về (ví dụ quiz state sau khi nộp) thì đưa vào cache bằng `setQueryData`, không bắt client gọi lại.

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
