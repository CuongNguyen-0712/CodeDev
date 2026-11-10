# Ranh giới route handler và server action — thiết kế (brainstorming, path: architectural)

## Context

`docs/api-conventions.md` đã có quy tắc: đọc qua route `GET`, ghi chỉ UI gọi qua server action (`runAction`), ghi thuộc HTTP API và lời gọi từ ngoài giữ route. Thực tế còn lệch: 15 handler ghi của blog, user và onboarding chỉ có UI của app gọi, nhưng vẫn đi qua route + hàm client + mutation. Like đã được chuyển sang `setPostLikeAction` (`actions/blog.actions.js`) làm mẫu.

Đã chốt với user:
- **Mục tiêu:** bớt boilerplate, thu hẹp bề mặt HTTP, theo cách App Router khuyến nghị.
- **Phạm vi:** phương án A, chỉ ghi phía người học (blog, user, onboarding). Admin, commerce và mọi `GET` giữ nguyên.
- **Client ngoài:** có ý định làm mobile và judge/runner riêng, nhưng chưa xác định phần API nào. Code hiện tại không có client ngoài nào (không CORS, không `OPTIONS`, không API key; sandbox chạy qua Inngest).
- **Kiểm tra quyền:** mọi action phải giữ đủ kiểm tra quyền mà route cũ có.

Kết quả: 15 handler ghi thành server action, 6 file `route.js` bị xoá, 6 file còn lại chỉ giữ `GET`, quy tắc trong docs có tiêu chí quyết định rõ ràng.

## Quy tắc

Một thao tác **giữ route handler** nếu đúng ít nhất một điều:

1. Là thao tác đọc mà React Query gọi (`useQuery` / `useInfiniteQuery`).
2. Người gọi không phải UI của app: webhook, Inngest, cron, health, Pusher, NextAuth.
3. Đặt hoặc xoay cookie phiên, hoặc chạy trước khi có phiên: `auth/*`, `user/signup`, `user/sessions`, `user/accounts/[provider]`, `user/delete-unverified`.
4. Cần admin step-up (`requirePermission` / `requireRecentAuth`): toàn bộ `admin/*`. Step-up phía client hiện chỉ replay được qua axios interceptor (`lib/axios.js`, `lib/adminStepUp.js`).
5. Liên quan tiền và có idempotency key: `commerce/checkout`, `commerce/redeem`.
6. Cần ngữ nghĩa HTTP: redirect, `Cache-Control` công khai, tải file.

Còn lại là ghi chỉ UI gọi: **server action** bọc `runAction`.

**Client ngoài.** Route ghi hiện dùng cookie + `assertSameOrigin` (`lib/requestGuard.js:17`): cần `Origin` trong allowlist hoặc `Sec-Fetch-Site: same-origin`, nên app native không gọi được. Khi có mobile, thêm route mới với auth bằng token, gọi cùng `services/*`. Không giữ route cookie "phòng hờ".

## Mẫu chuyển một handler

1. Thêm action trong `actions/<domain>.actions.js`, bọc `runAction` với **cùng limiter** route cũ dùng. Validate bằng `parseOrThrow(schema, input)` (`lib/validation/premium.js`, hàm thuần) hoặc regex id như route cũ.
2. Trong `mutations/<domain>.mutation.js`, đổi `mutationFn` sang `unwrapActionResult(await callWithAuthRetry(() => action(args)))` (`lib/actionResult.js`). Giữ nguyên `onSuccess` / `onSettled`.
3. Xoá hàm ghi tương ứng trong `clients/<domain>.client.js`.
4. Xoá handler ghi khỏi `route.js`. File không còn handler nào thì xoá file.

## Thay đổi theo domain

### Blog (7 handler)

| Route cũ | Action mới | Limiter | Service |
|---|---|---|---|
| `POST /api/blog/posts` | `createPostAction(input)` | `blogCreate` | `blogService.create` |
| `PATCH /api/blog/posts/[id]` | `updatePostAction({ id, ...input })` | `blogWrite` | `blogService.update` |
| `DELETE /api/blog/posts/[id]` | `deletePostAction(id)` | `blogWrite` | `blogService.remove` |
| `POST /api/blog/posts/[id]/comments` | `addCommentAction({ postId, body })` | `comment` | `blogInteractionService.addComment` |
| `DELETE /api/blog/comments/[id]` | `deleteCommentAction(commentId)` | `comment` | `blogInteractionService.deleteComment` |
| `POST /api/blog/posts/[id]/report` | `reportPostAction({ postId, reason })` | `feedback` | `blogInteractionService.report` |
| `POST /api/blog/images` (multipart) | `uploadBlogImageAction(formData)` | `upload` | `mediaService.uploadBlogImage` |

- Sáu action đầu nằm trong `actions/blog.actions.js`; upload nằm trong `actions/upload.actions.js`, theo mẫu `uploadAvatarAction`.
- Schema dùng lại: `postInputSchema`, `postPatchSchema`, `commentInputSchema`, `reportSchema` (`lib/validation/blog.js`).
- Giới hạn kích thước: ảnh tối đa 5 MB (`services/media.service.js:14`) và body bài 50.000 ký tự (~150 KB) đều dưới `serverActions.bodySizeLimit: '6mb'` (`next.config.js:21`).
- Xoá: `app/api/blog/posts/[id]/report/route.js`, `app/api/blog/comments/[id]/route.js`, `app/api/blog/images/route.js`.
- Chỉ còn `GET`: `app/api/blog/posts/route.js`, `app/api/blog/posts/[id]/route.js`, `app/api/blog/posts/[id]/comments/route.js`.

### User (4 handler)

| Route cũ | Action mới (`actions/user.actions.js`) | Limiter | Service |
|---|---|---|---|
| `PATCH /api/user/privacy` | `updatePrivacyAction(data)` | `profile` | `profileService.updatePrivacy` |
| `PATCH /api/user/notifications` | `markNotificationsAction(body)` | `profile` | `notificationService.markAllRead` / `markRead` / `dismiss` |
| `PATCH /api/user/avatars` | `restoreAvatarAction(assetId)` | `upload` | `mediaService.restoreAvatar` |
| `DELETE /api/user/avatars` | `deleteAvatarAction(assetId)` | `upload` | `mediaService.deleteAvatar` |

- Chuyển nguyên kiểm tra `{ all: true } | { ids: 1-100 uuid, dismiss? }` và regex `ASSET_ID` từ route sang action.
- Ba file `route.js` giữ `GET`.

### Onboarding (4 handler)

| Route cũ | Action mới (`actions/onboarding.actions.js`, file mới) | Service |
|---|---|---|
| `POST /api/onboarding/preferences` | `saveOnboardingStepAction(input)` | `onboardingService.saveStep` |
| `PATCH /api/onboarding/preferences` | `updatePreferencesAction(input)` | `onboardingService.updatePreferences` |
| `POST /api/onboarding/complete` | `completeOnboardingAction()` | `onboardingService.complete` |
| `POST /api/onboarding/skip` | `skipOnboardingAction()` | `onboardingService.skip` |

- Limiter `onboarding` cho cả bốn. Schema: `onboardingStepSchema`, `preferencesPatchSchema`.
- Xoá `app/api/onboarding/{preferences,complete,skip}/route.js`. Sửa `onboardingClient` (`clients/premium.client.js:9-12`) và `mutations/premium.mutation.js:76-79`.

## Hành vi thay đổi

- Lỗi vẫn mang `.status` / `.code` nhờ `unwrapActionResult`, nên `onError` hiện có chạy như cũ. Access token hết hạn do `callWithAuthRetry` xử lý; khoá xác minh email do `unwrapActionResult` chuyển hướng.
- `revalidateTag` do service gọi, khi chạy trong action, làm mới luôn RSC của trang hiện tại. Qua route thì không. Các action sẵn có đã hoạt động như vậy.
- Server action chạy tuần tự trên mỗi client. Chấp nhận được vì chỉ dùng cho ghi.
- CSRF: thay `csrf: true` của `apiRoute` bằng kiểm tra `Origin` có sẵn của Next cho server action. `proxy.js` loại `/api` khỏi matcher nhưng chạy cho action, nên không mất lớp bảo vệ nào của proxy.

## Kiểm tra quyền

Đã đọc từng service và hàm db mà 15 handler gọi. Mọi kiểm tra quyền theo tài nguyên nằm ở service hoặc db, khoá theo `userId` lấy từ phiên. Route cũ không tự kiểm tra quyền nào ngoài phần wrapper làm. Chuyển sang action không mất kiểm tra nào, với điều kiện giữ bốn bất biến bên dưới.

### Wrapper: `apiRoute` so với `runAction`

| Kiểm tra | Route cũ (`lib/routeHandler.js`) | Action mới (`lib/serverAction.js`) |
|---|---|---|
| Phải đăng nhập, phiên chưa bị thu hồi | `requireAuthSession` (`lib/session.js:104`) | Cùng hàm, `auth = true` mặc định |
| Tài khoản quá hạn xác minh email bị chặn (403) | `allowLocked: false` mặc định | `allowLocked = false` mặc định |
| Cùng origin | `csrf: true` → `assertSameOrigin` | Next so `Origin` với `Host` cho server action |
| Giới hạn tần suất | `limiter.limitRequest(req, userId)` | `limiter.check(userId)`, cùng limiter |

### Service / db: quyền theo tài nguyên

| Action | Kiểm tra quyền | Nơi kiểm tra |
|---|---|---|
| `createPostAction` | Email đã xác minh; ảnh phải là upload của chính tác giả | `services/blog.service.js:46`, `linkImages` (`:39`) |
| `updatePostAction` | Như trên + chỉ bài của mình | `blogDb.lockOwn` (`db/blog.db.js:17`, `author_id = $2`) |
| `deletePostAction` | Chỉ bài của mình | `blogService.remove` → `lockOwn` |
| `addCommentAction` | Email đã xác minh; bài phải đang published | `services/blogInteraction.service.js:83`, `lockLive` |
| `deleteCommentAction` | Chỉ tác giả bình luận | `blogInteraction.service.js:110` (khác tác giả → 404) |
| `reportPostAction` | Email đã xác minh; không báo cáo bài của mình; mỗi người một lần | `blogInteraction.service.js:96-102` |
| `uploadBlogImageAction` | Có `userId`; email đã xác minh; lưu dưới `users/<userId>/blog` | `services/media.service.js:123-130` |
| `updatePrivacyAction` | Chỉ hồ sơ của mình; chỉ nhận 3 khoá boolean | `profileService.updatePrivacy`, `db/profile.db.js:74` |
| `markNotificationsAction` | Chỉ thông báo của mình | `db/notification.db.js:53-76` (`WHERE user_id = …`) |
| `restoreAvatarAction`, `deleteAvatarAction` | Chỉ avatar của mình | `findOwnAvatar`, `db/media.db.js:135-156` |
| 4 action onboarding | Chỉ dòng onboarding của mình | `db/onboarding.db.js:59,138` |

Không action nào cần kiểm tra vai trò (`requirePermission`). Phần cần vai trò là admin, giữ route.

### Bốn bất biến khi viết action

1. **`userId` chỉ lấy từ `ctx` của `runAction`.** Tham số action không bao giờ chứa định danh người dùng. Schema zod bỏ khoá lạ, nên `userId` giả trong input bị loại.
2. **Mọi `export` trong file `'use server'` đi qua `runAction`.** Mỗi export là một endpoint công khai; không export helper, regex hay hàm chưa bọc.
3. **Không dùng `auth: false` hay `allowLocked` trong action mới.** Hiện chỉ `sendFeedbackAction` dùng `auth: false` và `updateUserProfileAction` dùng `allowLocked`.
4. **Giữ nguyên validate đầu vào của route cũ** (regex id, zod, giới hạn 1-100 uuid) trước khi gọi service.

### Lỗ hổng test hiện tại

`runAction` chưa có test nào. Chú thích "covered elsewhere" ở `__tests__/blog/blogActions.test.js:1` sai. Mọi test action đều mock `runAction`, nên đăng nhập, khoá email và limiter của action chưa được kiểm chứng ở đâu.

## Test

- **Mới — `__tests__/lists/serverAction.test.js`** (cạnh `apiRoute.test.js`): `runAction` thật, mock `@/lib/session`. Ca: chưa đăng nhập trả `status: 401` và handler không chạy; tài khoản bị khoá trả 403 `EMAIL_VERIFICATION_REQUIRED`; limiter từ chối trả 429 và handler không chạy; `userId` truyền vào handler là của phiên.
- **Mới — `__tests__/lists/actionsGuard.test.js`:** đọc mã nguồn mọi `actions/*.actions.js`; khẳng định số `export async function` bằng số `runAction(` trong từng file, và `auth: false` chỉ có ở `feedback.actions.js`. Cùng kiểu `__tests__/admin/adminAccess.test.js`. Sáu file hiện có đều thoả.
- Mỗi test action mới có một ca truyền `userId` giả trong input và khẳng định service nhận `userId` của phiên.
- `__tests__/blog/blogActions.test.js`: thêm ca cho 6 action blog mới (id sai trả 400, gọi đúng service, có limiter). Chuyển ca "body 50.000 ký tự tới được service" từ `__tests__/blog/blogWriteRoutes.test.js` sang, rồi xoá file đó. Sửa chú thích dòng 1 trỏ tới `serverAction.test.js`.
- `__tests__/notifications/notificationsRoute.test.js`: giữ ca `GET`; chuyển ca `PATCH` sang test của `markNotificationsAction`.
- Test ngắn cho action onboarding (schema sai trả 400) và avatar (`assetId` sai trả 400).
- Test component mock thêm action: `__tests__/blog/feedActions.test.jsx` (`@/actions/blog.actions`), `__tests__/notifications/notificationCenter.test.jsx` (`@/actions/user.actions`).
- Quyền theo tài nguyên đã có test ở lớp service, không viết lại: `blogService.integration`, `blogComments.integration`, `blogReports.integration`, `notificationDb.integration`, `avatarUpload`. Chạy lại để xác nhận còn xanh.

## Tài liệu

- `docs/api-conventions.md`: thay mục 1 bằng 6 tiêu chí ở trên; bỏ onboarding khỏi dòng "HTTP API"; thêm bảng "trước / sau" cho 15 handler và ghi chú về client ngoài.
- `docs/superpowers/specs/2026-11-09-community-blog-design.md`: sửa tiêu đề mục API (dòng 81) và các dòng ghi của blog thành action.
- `docs/superpowers/plans/2026-11-09-community-blog-p2.md` dòng 103 và 120: ghi chú route like đã thay bằng `setPostLikeAction`.

## Thứ tự và nhánh

Like đã chuyển xong (`ee47cdb6`) và nhánh blog đã gộp vào `develop`. Làm trên một nhánh mới tách từ `develop`, theo thứ tự: blog, user, onboarding, cuối cùng là docs quy tắc. Mỗi domain một commit.

## Kiểm chứng

- `npm test` xanh sau mỗi domain; `npm run build` không lỗi.
- Grep không còn kết quả: `blogClient\.(createPost|updatePost|deletePost|reportPost|addComment|deleteComment|uploadImage)`, `userClient\.(updatePrivacy|markNotificationsRead|restoreAvatar|deleteAvatar)`, `onboardingClient\.(saveStep|updatePreferences|complete|skip)`.
- Chạy dev server, thử từng luồng ghi của 15 handler. Tab Network: mỗi thao tác là `POST` tới URL trang với header `Next-Action`, không còn lời gọi ghi tới `/api/blog`, `/api/user/{privacy,notifications,avatars}`, `/api/onboarding`.
- `POST /api/onboarding/skip` trả 404; `PATCH /api/user/privacy` trả 405.
- Hai tài khoản A và B: B sửa, xoá bài của A và xoá bình luận của A đều nhận "not found"; B khôi phục avatar của A nhận 404; đăng xuất rồi bấm Like nhận 401; tài khoản chưa xác minh email viết bài nhận 403.

## Ngoài phạm vi

- Admin (38 handler ghi) và commerce: giữ route. Chuyển admin cần dựng lại step-up MFA cho action và viết lại `__tests__/admin/adminAccess.test.js`.
- Mọi handler `GET`.
- Gom regex `POST_ID` đang lặp ở các route `GET`.
- `app/api/internal/*` và `GET /api/admin/mfa` không còn caller: chỉ ghi nhận, chưa xoá.
