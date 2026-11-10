# Learner-side writes to server actions — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chuyển 15 handler ghi của blog, user và onboarding từ route handler sang server action, giữ nguyên mọi kiểm tra quyền.

**Architecture:** Mỗi handler ghi thành một action bọc `runAction` (`lib/serverAction.js`), gọi đúng service cũ với đúng limiter cũ. Mutation React Query gọi action qua `callAction` (bọc `callWithAuthRetry` + `unwrapActionResult`). Hàm client axios và handler ghi trong `route.js` bị xoá; handler `GET` giữ nguyên. Hai test mới khoá lớp wrapper: `runAction` thật, và quét mã nguồn để mọi export trong `actions/` đều đi qua `runAction`.

**Tech Stack:** Next.js 16 (App Router, server actions), React 19, TanStack Query 5, zod 4, Vitest 5.

**Spec:** `docs/superpowers/specs/2026-11-10-api-vs-action-boundary-design.md`

## Global Constraints

- Làm trên nhánh `refactor/learner-writes-to-actions`, tách từ `develop`.
- Mọi action: `export async function <name>Action(...)` trong file có `'use server'`, thân chỉ là `return runAction(handler, { limiter: rateLimiters.<x>, context: "<name>Action" })`.
- `userId` chỉ lấy từ `ctx` của `runAction`. Không tham số action nào là định danh người dùng.
- Không dùng `auth: false` hay `allowLocked` trong action mới.
- Mọi `export` trong file `'use server'` là action bọc `runAction`. Regex và helper để không export.
- Giữ validate và thông điệp lỗi của route cũ, nguyên văn:
  - `POST_ID = /^pst_[0-9a-z]{26}$/` → `"Invalid post id"` (400)
  - `COMMENT_ID = /^pcm_[0-9a-z]{26}$/` → `"Invalid comment id"` (400)
  - `ASSET_ID = /^ast_[0-9a-z]{26}$/` → `"A valid assetId is required"` (400)
  - thông báo: `UUID = /^[0-9a-f-]{36}$/i`, `MAX_IDS = 100` → `"Body must be { all: true } or { ids: [uuid, ...] }"` (400)
- Limiter giữ như route cũ: `blogCreate`, `blogWrite`, `comment`, `feedback`, `upload`, `profile`, `onboarding`.
- Schema dùng lại, không viết mới: `postInputSchema`, `postPatchSchema`, `commentInputSchema`, `reportSchema` (`lib/validation/blog.js`); `onboardingStepSchema`, `preferencesPatchSchema`, `parseOrThrow` (`lib/validation/premium.js`).
- Mutation giữ nguyên `onSuccess` / `onSettled` / `onMutate` hiện có. Chỉ đổi `mutationFn`.
- Handler `GET` trong các file route giữ nguyên. File không còn handler nào thì xoá cả file.
- Body bài viết tối đa 50.000 ký tự. Ảnh tối đa 5 MB (`"Images can be at most 5 MB"`). `serverActions.bodySizeLimit` là `'6mb'` (`next.config.js:21`), không đổi.
- Mỗi task một commit, kết thúc bằng `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Ảnh blog trên 5 MB** (kể cả trên 6 MB, khi Next chặn body trước khi tới `runAction`): người dùng phải thấy "Images can be at most 5 MB", không phải lỗi chung. Test ở Task 4.
2. **`userId` giả trong input action:** service vẫn nhận `userId` của phiên; onboarding trả 400. Test ở Task 2, 5, 6.
3. **Gọi action thiếu hoặc sai kiểu tham số** (`undefined`, `null`, chuỗi rỗng): trả 400, không văng 500, không gọi service. Test ở Task 2, 3, 5.
4. **`{ all: true, dismiss: true }`** không được gỡ mọi thông báo một lúc (route cũ: `all` thắng, chỉ đánh dấu đã đọc). Test ở Task 5.
5. **Body 50.000 ký tự nhiều byte** (`"ả".repeat(50000)`, ~150 KB) tới được service qua action. Test ở Task 2.

---

### Task 1: Khoá lớp wrapper của action

**Files:**
- Create: `__tests__/lists/serverAction.test.js`, `__tests__/lists/actionsGuard.test.js`
- Modify: `__tests__/blog/blogActions.test.js:1` (chú thích)

**Interfaces:**
- Consumes: `runAction(handler, { auth = true, allowLocked = false, limiter = null, context })` (`lib/serverAction.js:18`), `ApiError` (`lib/error/apiError.js`), `AUTH_ERROR` (`constants/auth`).
- Produces: hai test chạy trên mọi task sau; `actionsGuard.test.js` tự kiểm cả `actions/onboarding.actions.js` khi Task 6 tạo file đó.

- [ ] **Step 1: Tạo nhánh**

Run: `git switch -c refactor/learner-writes-to-actions develop`
Expected: `Switched to a new branch 'refactor/learner-writes-to-actions'`

- [ ] **Step 2: Viết `__tests__/lists/serverAction.test.js`**

Setup như `__tests__/lists/apiRoute.test.js:3-5`: mock `@/lib/session` với `requireAuthSession`, `getAuthSession` (vi.fn) và `getRequestMeta: async () => ({ headers: new Headers() })`; mock `@/lib/rateLimit` thành `{ RateLimiter: { getClientIp: () => "203.0.113.7" } }`; `await import("@/lib/serverAction")`. `beforeEach` reset hai mock session.

```js
it("signed out: 401 UNAUTHENTICATED and the handler never runs", async () => {
    requireAuthSession.mockRejectedValue(new ApiError("Unauthorized: please sign in to continue.", 401, { code: AUTH_ERROR.UNAUTHENTICATED }));
    const handler = vi.fn();
    expect(await runAction(handler)).toMatchObject({ success: false, status: 401, code: AUTH_ERROR.UNAUTHENTICATED });
    expect(handler).not.toHaveBeenCalled();
    expect(requireAuthSession).toHaveBeenCalledWith({ allowLocked: false });
});

it("locked account: 403 EMAIL_VERIFICATION_REQUIRED and the handler never runs", async () => {
    requireAuthSession.mockRejectedValue(new ApiError("Verify your email to keep using CodeDev.", 403, { code: AUTH_ERROR.EMAIL_VERIFICATION_REQUIRED, expose: true }));
    const handler = vi.fn();
    expect(await runAction(handler)).toMatchObject({ success: false, status: 403, code: AUTH_ERROR.EMAIL_VERIFICATION_REQUIRED });
    expect(handler).not.toHaveBeenCalled();
});

it("limiter refusal: 429 with retryAfter, keyed by the session user", async () => {
    requireAuthSession.mockResolvedValue({ user: { id: "usr_1" } });
    const limiter = { check: vi.fn(async () => ({ success: false, retryAfter: 30 })) };
    const handler = vi.fn();
    expect(await runAction(handler, { limiter })).toMatchObject({ success: false, status: 429, retryAfter: 30 });
    expect(limiter.check).toHaveBeenCalledWith("usr_1");
    expect(handler).not.toHaveBeenCalled();
});

it("gives the handler the session's user id and returns plain data", async () => {
    requireAuthSession.mockResolvedValue({ user: { id: "usr_1" } });
    const handler = vi.fn(async () => ({ at: new Date(0) }));
    expect(await runAction(handler)).toEqual({ success: true, data: { at: "1970-01-01T00:00:00.000Z" } });
    expect(handler.mock.calls[0][0].userId).toBe("usr_1");
});

it("auth false: guests are rate limited by client IP", async () => {
    getAuthSession.mockResolvedValue(null);
    const limiter = { check: vi.fn(async () => ({ success: true })) };
    const handler = vi.fn(async ({ userId }) => userId);
    expect(await runAction(handler, { auth: false, limiter })).toEqual({ success: true, data: null });
    expect(limiter.check).toHaveBeenCalledWith("203.0.113.7");
});

it("an unexpected error is a 500 without its internals", async () => {
    requireAuthSession.mockResolvedValue({ user: { id: "usr_1" } });
    const result = await runAction(async () => { throw new Error("relation secret_table does not exist"); });
    expect(result).toMatchObject({ success: false, status: 500 });
    expect(result.message).not.toMatch(/secret_table/);
});
```

- [ ] **Step 3: Chạy, mong đợi PASS**

Run: `npx vitest run __tests__/lists/serverAction.test.js`
Expected: 6 passed. Đây là test mô tả hành vi đã có. Nếu một ca fail, dừng lại và báo: đó là lỗi của `runAction`, không sửa test cho khớp.

- [ ] **Step 4: Viết `__tests__/lists/actionsGuard.test.js`**

Theo kiểu `__tests__/admin/adminAccess.test.js:9-36`: đọc mọi `actions/*.actions.js` bằng `readdirSync` + `readFileSync`.

```js
it.each(files)("%s: 'use server', and every export is an async action wrapped in runAction", (name) => {
    const source = read(name);
    expect(source).toMatch(/^\s*['"]use server['"]/);
    const exported = source.match(/^export\b/gm) || [];
    const actions = source.match(/^export async function \w+Action\(/gm) || [];
    const wrapped = source.match(/runAction\(/g) || [];
    expect(exported.length).toBeGreaterThan(0);
    expect(actions.length).toBe(exported.length);
    expect(wrapped.length).toBe(actions.length);
});

it("only the feedback action skips sign-in", () => {
    expect(files.filter((name) => /auth:\s*false/.test(read(name)))).toEqual(["feedback.actions.js"]);
});

it("only the profile update accepts a locked account, once", () => {
    expect(files.filter((name) => read(name).includes("allowLocked"))).toEqual(["user.actions.js"]);
    expect(read("user.actions.js").match(/allowLocked/g)).toHaveLength(1);
});
```

- [ ] **Step 5: Chạy, mong đợi PASS**

Run: `npx vitest run __tests__/lists/actionsGuard.test.js`
Expected: PASS cho 6 file hiện có cộng 2 ca còn lại.

- [ ] **Step 6: Sửa chú thích dòng 1 của `__tests__/blog/blogActions.test.js`**

Thay "(runAction itself is covered elsewhere)" bằng "(runAction itself: __tests__/lists/serverAction.test.js)".

- [ ] **Step 7: Commit**

```bash
git add __tests__/lists/serverAction.test.js __tests__/lists/actionsGuard.test.js __tests__/blog/blogActions.test.js
git commit -m "test(actions): cover runAction and require every server action export to go through it"
```

---

### Task 2: Bài viết blog — tạo, sửa, xoá

**Files:**
- Modify: `lib/actionResult.js` (thêm `callAction`)
- Modify: `actions/blog.actions.js`
- Modify: `mutations/blog.mutation.js:20-27`
- Modify: `clients/blog.client.js:14-16` (xoá `createPost`, `updatePost`, `deletePost`)
- Modify: `app/api/blog/posts/route.js` (xoá `POST`), `app/api/blog/posts/[id]/route.js` (xoá `PATCH`, `DELETE`, import thừa)
- Test: `__tests__/blog/blogActions.test.js`
- Delete: `__tests__/blog/blogWriteRoutes.test.js`

**Interfaces:**
- Produces:
  - `callAction(run: () => Promise<ActionResult>) → Promise<data>` trong `lib/actionResult.js`: `unwrapActionResult(await callWithAuthRetry(run))`. Task 3-6 dùng hàm này.
  - `createPostAction(input) → ActionResult<{ id, slug, status, rewards? }>`; limiter `blogCreate`; `parseOrThrow(postInputSchema, input)`; gọi `blogService.create({ userId, input })`.
  - `updatePostAction({ id, ...input } = {}) → ActionResult<{ id, slug, status, rewards? }>`; limiter `blogWrite`; kiểm `id` bằng `POST_ID` trước, rồi `parseOrThrow(postPatchSchema, input)`; gọi `blogService.update({ userId, postId: id, input })`.
  - `deletePostAction(id) → ActionResult<{ deleted: true }>`; limiter `blogWrite`; gọi `blogService.remove({ userId, postId: id })`.
  - Helper không export trong `actions/blog.actions.js`: `postIdOf(value)` trả `value` khi `POST_ID.test(String(value ?? ""))`, nếu không thì ném `ApiError("Invalid post id", 400)`. `setPostLikeAction` dùng lại helper này. Mọi action có id bài kiểm id trước, rồi mới parse phần còn lại.

- [ ] **Step 1: Viết test hỏng trong `__tests__/blog/blogActions.test.js`**

Thêm mock `vi.mock("@/services/blog.service", () => ({ blogService: post }))` với `const post = { create: vi.fn(), update: vi.fn(), remove: vi.fn() }`, reset trong `beforeEach` (create/update trả `{ id: POST, slug: "a-post", status: "draft" }`, remove trả `{ deleted: true }`). Import thật `{ rateLimiters } from "@/lib/rateLimit"`. `const draft = { title: "A long post", tags: ["js"], body: "Hello", submit: false };`

```js
it("createPostAction parses the post and uses the blogCreate limiter", async () => {
    const result = await createPostAction(draft);
    expect(result).toMatchObject({ success: true, data: { id: POST, status: "draft" } });
    expect(post.create).toHaveBeenCalledWith({ userId: "u1", input: draft });
    expect(result.options.limiter).toBe(rateLimiters.blogCreate);
});

it("createPostAction accepts a 50,000-character multi-byte body", async () => {
    await createPostAction({ ...draft, body: "ả".repeat(50000) });
    expect(post.create.mock.calls[0][0].input.body).toHaveLength(50000);
});

it("createPostAction ignores a userId sent in the input", async () => {
    await createPostAction({ ...draft, userId: "usr_attacker" });
    expect(post.create.mock.calls[0][0].userId).toBe("u1");
    expect(post.create.mock.calls[0][0].input).not.toHaveProperty("userId");
});

it.each([undefined, null, {}, { title: "x" }])("createPostAction(%j) is a 400 before any write", async (input) => {
    expect(await createPostAction(input)).toMatchObject({ success: false, status: 400 });
    expect(post.create).not.toHaveBeenCalled();
});

it("updatePostAction checks the id first, then the patch, with the blogWrite limiter", async () => {
    expect(await updatePostAction({ id: "pst_../x", ...draft })).toMatchObject({ success: false, status: 400, message: "Invalid post id" });
    expect(await updatePostAction(undefined)).toMatchObject({ success: false, status: 400, message: "Invalid post id" });
    expect(post.update).not.toHaveBeenCalled();
    const result = await updatePostAction({ id: POST, ...draft, appealReason: "Please look again at this" });
    expect(post.update).toHaveBeenCalledWith({ userId: "u1", postId: POST, input: { ...draft, appealReason: "Please look again at this" } });
    expect(result.options.limiter).toBe(rateLimiters.blogWrite);
});

it("deletePostAction removes only a well-formed id, with the blogWrite limiter", async () => {
    for (const bad of [undefined, "", "pst_x"]) expect(await deletePostAction(bad)).toMatchObject({ success: false, status: 400 });
    expect(post.remove).not.toHaveBeenCalled();
    const result = await deletePostAction(POST);
    expect(post.remove).toHaveBeenCalledWith({ userId: "u1", postId: POST });
    expect(result.options.limiter).toBe(rateLimiters.blogWrite);
});

it("the post routes keep only their reads", async () => {
    expect((await import("@/app/api/blog/posts/route")).POST).toBeUndefined();
    const byId = await import("@/app/api/blog/posts/[id]/route");
    expect([byId.PATCH, byId.DELETE]).toEqual([undefined, undefined]);
    expect(byId.GET).toBeTypeOf("function");
});
```

- [ ] **Step 2: Chạy, mong đợi FAIL**

Run: `npx vitest run __tests__/blog/blogActions.test.js`
Expected: FAIL, `createPostAction is not a function` (và các action khác tương tự).

- [ ] **Step 3: Thêm `callAction` vào `lib/actionResult.js`, rồi ba action vào `actions/blog.actions.js`**

Theo Interfaces ở trên và mẫu `setPostLikeAction`. Đổi `setPostLikeAction` sang dùng `postIdOf` (giữ nguyên hành vi).

- [ ] **Step 4: Xoá handler ghi khỏi hai file route**

`app/api/blog/posts/route.js`: xoá `POST`, bỏ import `postInputSchema`, `readJson`, `rateLimiters`. `app/api/blog/posts/[id]/route.js`: xoá `PATCH`, `DELETE`, bỏ import `rateLimiters`, `postPatchSchema`, `parseOrThrow`, `readJson`.

- [ ] **Step 5: Đổi mutation, xoá hàm client**

Trong `mutations/blog.mutation.js`: `useCreatePost`, `useUpdatePost`, `useDeletePost` gọi `callAction(() => xAction(arg))`; `useSetLike` dùng `callAction` thay cho cặp `unwrapActionResult`/`callWithAuthRetry`. Xoá `createPost`, `updatePost`, `deletePost` trong `clients/blog.client.js`.

- [ ] **Step 6: Xoá test route cũ, chạy lại**

Run: `git rm __tests__/blog/blogWriteRoutes.test.js` rồi `npx vitest run __tests__/blog`
Expected: PASS. `__tests__/blog/postEditorRewards.test.jsx` vẫn xanh (nó mock cả mutation).

- [ ] **Step 7: Commit**

```bash
git add lib/actionResult.js actions/blog.actions.js mutations/blog.mutation.js clients/blog.client.js app/api/blog/posts __tests__/blog
git commit -m "refactor(blog): create, edit and delete posts through server actions"
```

---

### Task 3: Bình luận và báo cáo blog

**Files:**
- Modify: `actions/blog.actions.js`, `mutations/blog.mutation.js` (`useAddComment`, `useDeleteComment`, `useReportPost`), `clients/blog.client.js` (xoá `reportPost`, `addComment`, `deleteComment`)
- Modify: `app/api/blog/posts/[id]/comments/route.js` (xoá `POST`, import thừa)
- Delete: `app/api/blog/comments/[id]/route.js`, `app/api/blog/posts/[id]/report/route.js`
- Test: `__tests__/blog/blogActions.test.js`, `__tests__/blog/feedActions.test.jsx`

**Interfaces:**
- Consumes: `postIdOf`, `callAction` (Task 2).
- Produces:
  - `addCommentAction({ postId, body } = {}) → ActionResult<{ id, body, createdAt, author, own }>`; limiter `comment`; `parseOrThrow(commentInputSchema, { body })`; gọi `blogInteractionService.addComment({ userId, postId, input })`.
  - `deleteCommentAction(commentId) → ActionResult<{ deleted: true }>`; limiter `comment`; `COMMENT_ID`; gọi `blogInteractionService.deleteComment({ userId, commentId })`.
  - `reportPostAction({ postId, reason } = {}) → ActionResult<{ reported: true }>`; limiter `feedback`; `parseOrThrow(reportSchema, { reason })`; gọi `blogInteractionService.report({ userId, postId, input })`.
  - Mutation giữ chữ ký: `useAddComment(postId).mutate(body)`, `useDeleteComment(postId).mutate(commentId)`, `useReportPost().mutate({ id, reason })`.

- [ ] **Step 1: Viết test hỏng trong `__tests__/blog/blogActions.test.js`**

Thêm `addComment`, `deleteComment`, `report` (vi.fn) vào `svc`; reset trong `beforeEach`.

```js
it("addCommentAction checks the post id and body, with the comment limiter", async () => {
    expect(await addCommentAction({ postId: "bad", body: "Hi" })).toMatchObject({ success: false, status: 400, message: "Invalid post id" });
    expect(await addCommentAction({ postId: POST, body: "   " })).toMatchObject({ success: false, status: 400 });
    expect(await addCommentAction(undefined)).toMatchObject({ success: false, status: 400 });
    expect(svc.addComment).not.toHaveBeenCalled();
    const result = await addCommentAction({ postId: POST, body: "Hi", userId: "usr_attacker" });
    expect(svc.addComment).toHaveBeenCalledWith({ userId: "u1", postId: POST, input: { body: "Hi" } });
    expect(result.options.limiter).toBe(rateLimiters.comment);
});

it("deleteCommentAction needs a comment id, with the comment limiter", async () => {
    for (const bad of [undefined, "pst_x", POST]) expect(await deleteCommentAction(bad)).toMatchObject({ success: false, status: 400, message: "Invalid comment id" });
    expect(svc.deleteComment).not.toHaveBeenCalled();
    const COMMENT = `pcm_${"b".repeat(26)}`;
    const result = await deleteCommentAction(COMMENT);
    expect(svc.deleteComment).toHaveBeenCalledWith({ userId: "u1", commentId: COMMENT });
    expect(result.options.limiter).toBe(rateLimiters.comment);
});

it("reportPostAction needs a reason of at least 5 characters, with the feedback limiter", async () => {
    expect(await reportPostAction({ postId: POST, reason: "spam" })).toMatchObject({ success: false, status: 400 });
    expect(svc.report).not.toHaveBeenCalled();
    const result = await reportPostAction({ postId: POST, reason: "Spam links everywhere" });
    expect(svc.report).toHaveBeenCalledWith({ userId: "u1", postId: POST, input: { reason: "Spam links everywhere" } });
    expect(result.options.limiter).toBe(rateLimiters.feedback);
});

it("the comments route keeps only its read", async () => {
    const mod = await import("@/app/api/blog/posts/[id]/comments/route");
    expect(mod.POST).toBeUndefined();
    expect(mod.GET).toBeTypeOf("function");
});
```

- [ ] **Step 2: Chạy, mong đợi FAIL**

Run: `npx vitest run __tests__/blog/blogActions.test.js`
Expected: FAIL, `addCommentAction is not a function`.

- [ ] **Step 3: Thêm ba action; xoá `POST` khỏi route comments; xoá hai file route**

Run cho phần xoá: `git rm "app/api/blog/comments/[id]/route.js" "app/api/blog/posts/[id]/report/route.js"`

- [ ] **Step 4: Đổi ba mutation sang `callAction`, xoá ba hàm client**

- [ ] **Step 5: Sửa `__tests__/blog/feedActions.test.jsx`**

Mock `@/actions/blog.actions` thêm `addCommentAction: (...args) => addCommentAction(...args)` với `const addCommentAction = vi.fn()`; bỏ `addComment` khỏi `api`. Trong `describe("useAddComment")`, thay `api.addComment.mockResolvedValue(comment)` bằng `addCommentAction.mockResolvedValue({ success: true, data: comment })`; reset nó trong `afterEach`.

- [ ] **Step 6: Chạy, mong đợi PASS**

Run: `npx vitest run __tests__/blog`
Expected: PASS, gồm `postCommentForm.test.jsx` (mock mutation, không đổi).

- [ ] **Step 7: Commit**

```bash
git add actions/blog.actions.js mutations/blog.mutation.js clients/blog.client.js app/api/blog __tests__/blog
git commit -m "refactor(blog): comment, delete comment and report through server actions"
```

---

### Task 4: Tải ảnh blog

**Files:**
- Modify: `actions/upload.actions.js`, `mutations/blog.mutation.js` (`useUploadBlogImage`), `clients/blog.client.js` (xoá `uploadImage`)
- Delete: `app/api/blog/images/route.js`
- Test: `__tests__/blog/blogActions.test.js`, `__tests__/blog/feedActions.test.jsx`

**Interfaces:**
- Consumes: `callAction` (Task 2).
- Produces:
  - `uploadBlogImageAction(formData) → ActionResult<{ url, width, height }>`; limiter `upload`; gọi `mediaService.uploadBlogImage({ userId, file: formData?.get?.("file") })`. Theo mẫu `uploadAvatarAction` cùng file.
  - `useUploadBlogImage().mutateAsync(file) → { url, width, height }`. File trên `BLOG_IMAGE_MAX_BYTES = 5 * 1024 * 1024` bị từ chối trước khi gửi, bằng `Error("Images can be at most 5 MB")` có `status: 413`. Hằng số khai báo trong `mutations/blog.mutation.js`, chú thích một dòng: giống `MAX_AVATAR_BYTES` ở `services/media.service.js`; body trên 6 MB không bao giờ tới action. Cùng cách `components/settings/settingsPage.jsx:16` làm cho avatar.

- [ ] **Step 1: Viết test hỏng**

Trong `__tests__/blog/blogActions.test.js`: mock `@/services/media.service` thành `{ mediaService: media }` với `const media = { uploadBlogImage: vi.fn(async () => ({ url: "https://img/x.png", width: 10, height: 10 })) }`; import `uploadBlogImageAction` từ `@/actions/upload.actions`.

```js
it("uploadBlogImageAction hands the file and the session user to mediaService, with the upload limiter", async () => {
    const file = new File(["x"], "x.png", { type: "image/png" });
    const form = new FormData();
    form.append("file", file);
    const result = await uploadBlogImageAction(form);
    expect(result).toMatchObject({ success: true, data: { url: "https://img/x.png" } });
    expect(media.uploadBlogImage).toHaveBeenCalledWith({ userId: "u1", file: expect.any(File) });
    expect(result.options.limiter).toBe(rateLimiters.upload);
});
```

Trong `__tests__/blog/feedActions.test.jsx`: mock `@/actions/upload.actions` với `uploadBlogImageAction: (...a) => uploadBlogImageAction(...a)` (`const uploadBlogImageAction = vi.fn()`, reset trong `afterEach`); thêm `useUploadBlogImage` vào dòng import `@/mutations/blog.mutation`.

```js
describe("useUploadBlogImage", () => {
    const hook = () => renderHook(() => useUploadBlogImage(), { wrapper: ({ children }) => <QueryClientProvider client={newClient()}>{children}</QueryClientProvider> });

    it("refuses an image over 5 MB before anything is sent", async () => {
        const { result } = hook();
        const big = new File([new Uint8Array(5 * 1024 * 1024 + 1)], "big.png", { type: "image/png" });
        await expect(result.current.mutateAsync(big)).rejects.toMatchObject({ message: "Images can be at most 5 MB", status: 413 });
        expect(uploadBlogImageAction).not.toHaveBeenCalled();
    });

    it("sends the file as form data and returns the stored image", async () => {
        uploadBlogImageAction.mockResolvedValue({ success: true, data: { url: "https://img/x.png", width: 1, height: 1 } });
        const { result } = hook();
        expect(await result.current.mutateAsync(new File(["x"], "x.png", { type: "image/png" }))).toEqual({ url: "https://img/x.png", width: 1, height: 1 });
        expect(uploadBlogImageAction.mock.calls[0][0].get("file")).toBeInstanceOf(File);
    });
});
```

- [ ] **Step 2: Chạy, mong đợi FAIL**

Run: `npx vitest run __tests__/blog/blogActions.test.js __tests__/blog/feedActions.test.jsx`
Expected: FAIL, `uploadBlogImageAction is not a function` và lời gọi upload vẫn đi qua client.

- [ ] **Step 3: Thêm action, đổi mutation, xoá hàm client và route**

Run cho phần xoá: `git rm app/api/blog/images/route.js`

- [ ] **Step 4: Chạy, mong đợi PASS**

Run: `npx vitest run __tests__/blog __tests__/lists`
Expected: PASS. `actionsGuard.test.js` đếm `upload.actions.js` là 2/2.

- [ ] **Step 5: Commit**

```bash
git add actions/upload.actions.js mutations/blog.mutation.js clients/blog.client.js app/api/blog __tests__/blog
git commit -m "refactor(blog): upload post images through a server action, size checked before sending"
```

---

### Task 5: Quyền riêng tư, thông báo, avatar

**Files:**
- Modify: `actions/user.actions.js`, `mutations/user.mutation.js` (`useRestoreAvatar`, `useDeleteAvatar`, `useUpdatePrivacy`, `useMarkNotificationsRead`, `useDismissNotifications`), `clients/user.client.js` (xoá `markNotificationsRead`, `updatePrivacy`, `restoreAvatar`, `deleteAvatar`)
- Modify: `app/api/user/privacy/route.js`, `app/api/user/notifications/route.js`, `app/api/user/avatars/route.js` (xoá handler ghi và import thừa)
- Create: `__tests__/settings/userActions.test.js`
- Modify: `__tests__/notifications/notificationsRoute.test.js`, `__tests__/notifications/notificationCenter.test.jsx`

**Interfaces:**
- Consumes: `callAction` (Task 2).
- Produces:
  - `updatePrivacyAction(data) → ActionResult<privacy flags>`; limiter `profile`; gọi `profileService.updatePrivacy(userId, data ?? {})`. Service tự kiểm 3 khoá boolean.
  - `markNotificationsAction(body) → ActionResult<{ updated: number }>`; limiter `profile`. Logic chuyển nguyên từ route: `body?.all === true` → `markAllRead({ userId })`; nếu không, `ids` phải là mảng 1-100 chuỗi khớp `UUID`, sai thì 400 với thông điệp ở Global Constraints; `body.dismiss === true` → `dismiss({ userId, ids })`, ngược lại `markRead({ userId, ids })`.
  - `restoreAvatarAction(assetId) → ActionResult<{ image }>` và `deleteAvatarAction(assetId) → ActionResult<{ deleted: true }>`; limiter `upload`; kiểm `ASSET_ID` trên `String(assetId ?? "")`; gọi `mediaService.restoreAvatar` / `deleteAvatar({ userId, assetId })`. Tham số là chuỗi `assetId`, không còn là `{ assetId }`.
  - Mutation giữ chữ ký: `useUpdatePrivacy().mutate(data)`, `useMarkNotificationsRead().mutate(body)`, `useDismissNotifications().mutate(ids)` (gọi `markNotificationsAction({ ids, dismiss: true })`), `useRestoreAvatar().mutate(assetId)`, `useDeleteAvatar().mutate(assetId)`.

- [ ] **Step 1: Viết `__tests__/settings/userActions.test.js` (hỏng)**

Mock `@/lib/serverAction` theo mẫu `__tests__/blog/blogActions.test.js:6-14`. Mock `@/services/profile.service` (`profileService.updatePrivacy`), `@/services/notification.service` (`notificationService.markRead`, `markAllRead`, `dismiss`), `@/services/media.service` (`mediaService.restoreAvatar`, `deleteAvatar`), và các import sẵn có của `actions/user.actions.js`: `@/services/user.service`, `@/db/user.db`, `@/services/emailVerification.service` thành object rỗng. `const UUID = "6f3a1c2e-0000-4000-8000-000000000001"`, `const ASSET = \`ast_${"c".repeat(26)}\``.

```js
it("updatePrivacyAction updates the session user's profile only, with the profile limiter", async () => {
    const result = await updatePrivacyAction({ showProfile: false, userId: "usr_attacker" });
    expect(profile.updatePrivacy.mock.calls[0][0]).toBe("u1");
    expect(result.options.limiter).toBe(rateLimiters.profile);
});

it.each([undefined, null, {}, { ids: [] }, { ids: ["not-a-uuid"] }, { ids: Array(101).fill(UUID) }])(
    "markNotificationsAction(%j) is a 400 before any write", async (body) => {
        expect(await markNotificationsAction(body)).toMatchObject({ success: false, status: 400 });
        expect(notify.markRead).not.toHaveBeenCalled();
        expect(notify.dismiss).not.toHaveBeenCalled();
    });

it("markNotificationsAction marks by ids, all, or dismisses ids", async () => {
    await markNotificationsAction({ ids: [UUID] });
    expect(notify.markRead).toHaveBeenCalledWith({ userId: "u1", ids: [UUID] });
    await markNotificationsAction({ ids: [UUID], dismiss: true });
    expect(notify.dismiss).toHaveBeenCalledWith({ userId: "u1", ids: [UUID] });
    const result = await markNotificationsAction({ all: true });
    expect(notify.markAllRead).toHaveBeenCalledWith({ userId: "u1" });
    expect(result.options.limiter).toBe(rateLimiters.profile);
});

it("all with dismiss only marks read, never dismisses every item", async () => {
    await markNotificationsAction({ all: true, dismiss: true });
    expect(notify.markAllRead).toHaveBeenCalledTimes(1);
    expect(notify.dismiss).not.toHaveBeenCalled();
});

it.each([["restoreAvatarAction", "restoreAvatar"], ["deleteAvatarAction", "deleteAvatar"]])(
    "%s needs an asset id, with the upload limiter", async (action, method) => {
        const run = actions[action];
        for (const bad of [undefined, "", "ast_x", { assetId: ASSET }]) {
            expect(await run(bad)).toMatchObject({ success: false, status: 400, message: "A valid assetId is required" });
        }
        expect(media[method]).not.toHaveBeenCalled();
        const result = await run(ASSET);
        expect(media[method]).toHaveBeenCalledWith({ userId: "u1", assetId: ASSET });
        expect(result.options.limiter).toBe(rateLimiters.upload);
    });

it("the privacy, notifications and avatars routes keep only their reads", async () => {
    for (const path of ["privacy", "notifications", "avatars"]) {
        const mod = await import(`@/app/api/user/${path}/route`);
        expect([mod.PATCH, mod.DELETE]).toEqual([undefined, undefined]);
        expect(mod.GET).toBeTypeOf("function");
    }
});
```

`actions` là namespace `await import("@/actions/user.actions")`. Không mock `@/lib/rateLimit`: test so sánh với `rateLimiters` thật. Ca cuối import route thật, như `__tests__/blog/blogRoutes.test.js` đã làm; service của ba route đã bị mock ở đầu file.

- [ ] **Step 2: Chạy, mong đợi FAIL**

Run: `npx vitest run __tests__/settings/userActions.test.js`
Expected: FAIL, `updatePrivacyAction is not a function`.

- [ ] **Step 3: Thêm bốn action vào `actions/user.actions.js`**

- [ ] **Step 4: Xoá handler ghi trong ba file route; đổi năm mutation sang `callAction`; xoá bốn hàm client**

- [ ] **Step 5: Sửa hai test cũ**

`__tests__/notifications/notificationsRoute.test.js`: xoá helper `patch`, ca "marks read by ids…" và "removes items with dismiss…", phần `PATCH` trong ca 401; sửa chú thích đầu file thành "/api/user/notifications GET: signed out is 401; the list takes the unread filter and cursor."; đổi import thành `const { GET } = …`.
`__tests__/notifications/notificationCenter.test.jsx`: bỏ `markNotificationsRead` khỏi mock client; thêm `vi.mock("@/actions/user.actions", () => ({ markNotificationsAction: vi.fn(async () => ({ success: true, data: { updated: 0 } })) }))`.

- [ ] **Step 6: Chạy, mong đợi PASS**

Run: `npx vitest run __tests__/settings __tests__/notifications __tests__/media __tests__/lists`
Expected: PASS. `__tests__/media/avatarUpload.test.js` không đổi (test lớp service).

- [ ] **Step 7: Commit**

```bash
git add actions/user.actions.js mutations/user.mutation.js clients/user.client.js app/api/user __tests__/settings __tests__/notifications
git commit -m "refactor(user): privacy, notifications and avatar history through server actions"
```

---

### Task 6: Onboarding

**Files:**
- Create: `actions/onboarding.actions.js`, `__tests__/premium/onboardingActions.test.js`
- Modify: `mutations/premium.mutation.js:76-79`, `clients/premium.client.js:9-12` (xoá `saveStep`, `updatePreferences`, `complete`, `skip`), `__tests__/premium/units.test.js` (mock action)
- Delete: `app/api/onboarding/preferences/route.js`, `app/api/onboarding/complete/route.js`, `app/api/onboarding/skip/route.js`

**Interfaces:**
- Consumes: `callAction` (Task 2).
- Produces (mọi action limiter `onboarding`, trả trạng thái onboarding `{ status, currentStep, startedAt, completedAt, skippedAt, preferences }`):
  - `saveOnboardingStepAction(input)`: `parseOrThrow(onboardingStepSchema, input)` → `onboardingService.saveStep({ userId, input })`
  - `updatePreferencesAction(input)`: `parseOrThrow(preferencesPatchSchema, input)` → `onboardingService.updatePreferences({ userId, input })`
  - `completeOnboardingAction()` → `onboardingService.complete({ userId })`
  - `skipOnboardingAction()` → `onboardingService.skip({ userId })`
  - Mutation giữ chữ ký: `useSaveOnboardingStep().mutate(input)`, `useUpdatePreferences().mutate(input)`, `useCompleteOnboarding().mutate()`, `useSkipOnboarding().mutate()`.

- [ ] **Step 1: Viết `__tests__/premium/onboardingActions.test.js` (hỏng)**

Mock `@/lib/serverAction` theo mẫu; mock `@/services/onboarding.service` với bốn `vi.fn` trả `{ status: "in_progress" }`.

```js
it("saveOnboardingStepAction needs the data of the step, with the onboarding limiter", async () => {
    expect(await saveOnboardingStepAction({ step: "role" })).toMatchObject({ success: false, status: 400 });
    expect(await saveOnboardingStepAction(undefined)).toMatchObject({ success: false, status: 400 });
    expect(svc.saveStep).not.toHaveBeenCalled();
    const result = await saveOnboardingStepAction({ step: "role", roleCode: "backend_developer" });
    expect(svc.saveStep).toHaveBeenCalledWith({ userId: "u1", input: { step: "role", roleCode: "backend_developer" } });
    expect(result.options.limiter).toBe(rateLimiters.onboarding);
});

it("a userId in the input is refused (strict schemas)", async () => {
    expect(await saveOnboardingStepAction({ step: "role", roleCode: "backend_developer", userId: "usr_attacker" })).toMatchObject({ success: false, status: 400 });
    expect(await updatePreferencesAction({ userId: "usr_attacker" })).toMatchObject({ success: false, status: 400 });
    expect(svc.saveStep).not.toHaveBeenCalled();
    expect(svc.updatePreferences).not.toHaveBeenCalled();
});

it("updatePreferencesAction passes the parsed patch", async () => {
    await updatePreferencesAction({ experienceLevel: null });
    expect(svc.updatePreferences).toHaveBeenCalledWith({ userId: "u1", input: { experienceLevel: null } });
});

it("complete and skip act on the session user only", async () => {
    await completeOnboardingAction({ userId: "usr_attacker" });
    await skipOnboardingAction({ userId: "usr_attacker" });
    expect(svc.complete).toHaveBeenCalledWith({ userId: "u1" });
    expect(svc.skip).toHaveBeenCalledWith({ userId: "u1" });
});
```

- [ ] **Step 2: Chạy, mong đợi FAIL**

Run: `npx vitest run __tests__/premium/onboardingActions.test.js`
Expected: FAIL, không tìm thấy `@/actions/onboarding.actions`.

- [ ] **Step 3: Tạo `actions/onboarding.actions.js` với bốn action**

- [ ] **Step 4: Đổi bốn mutation sang `callAction`, xoá bốn hàm client, xoá ba file route**

Run cho phần xoá: `git rm app/api/onboarding/preferences/route.js app/api/onboarding/complete/route.js app/api/onboarding/skip/route.js`

- [ ] **Step 5: Mock action trong `__tests__/premium/units.test.js`**

Test này import `@/mutations/premium.mutation` để lấy `ownershipChangeKeys`; thêm trước import:
`vi.mock("@/actions/onboarding.actions", () => ({ saveOnboardingStepAction: vi.fn(), updatePreferencesAction: vi.fn(), completeOnboardingAction: vi.fn(), skipOnboardingAction: vi.fn() }));` (thêm `vi` vào import vitest nếu thiếu).

- [ ] **Step 6: Chạy, mong đợi PASS**

Run: `npx vitest run __tests__/premium __tests__/lists`
Expected: PASS. `actionsGuard.test.js` có thêm dòng `onboarding.actions.js` (4/4).

- [ ] **Step 7: Commit**

```bash
git add actions/onboarding.actions.js mutations/premium.mutation.js clients/premium.client.js app/api/onboarding __tests__/premium
git commit -m "refactor(onboarding): save, edit, complete and skip through server actions"
```

---

### Task 7: Tài liệu và kiểm chứng toàn nhánh

**Files:**
- Modify: `docs/api-conventions.md`, `docs/superpowers/specs/2026-11-09-community-blog-design.md:81-93`, `docs/superpowers/plans/2026-11-09-community-blog-p2.md:103,120`

- [ ] **Step 1: `docs/api-conventions.md`**

- Mục 1: thay bảng 4 dòng bằng 6 tiêu chí giữ route (spec, mục "Quy tắc"), câu "còn lại dùng server action", và đoạn "Client ngoài".
- Mục 3: thêm `callAction` (`lib/actionResult.js`) làm cách gọi chuẩn từ mutation; thêm 4 bất biến (spec, mục "Bốn bất biến") và nhắc `__tests__/lists/actionsGuard.test.js` kiểm 2 trong số đó.
- Mục 5: thêm bảng "trước / sau" cho 15 handler (lấy từ 3 bảng domain trong spec) và dòng Like (`POST`/`DELETE /api/blog/posts/[id]/like` → `setPostLikeAction`).

- [ ] **Step 2: Spec blog và plan P2**

- `2026-11-09-community-blog-design.md:81`: tiêu đề thành "## API và server action (route: `apiRoute`; action: `runAction`; zod trong `lib/validation/blog.js`)". Dòng 86, 87, 89, 92, 93: ghi đúng action thay cho route ghi (`createPostAction`, `updatePostAction`/`deletePostAction`, `uploadBlogImageAction`, `addCommentAction`/`deleteCommentAction`, `reportPostAction`); `GET /api/blog/posts/[id]/comments` giữ nguyên.
- `2026-11-09-community-blog-p2.md`: sau dòng 103 và 120 thêm một dòng "_Đã thay bằng `setPostLikeAction` (`actions/blog.actions.js`), xem `docs/superpowers/specs/2026-11-10-api-vs-action-boundary-design.md`._"

- [ ] **Step 3: Kiểm tĩnh**

Run: `npm test` → Expected: toàn bộ PASS (các test integration bỏ qua khi không có `DATABASE_URL`).
Run: `npm run lint` → Expected: không lỗi (bắt import thừa trong các route đã cắt).
Run: `npm run build` → Expected: build xong, không lỗi import tới hàm client hay route đã xoá.

- [ ] **Step 4: Grep không còn lời gọi cũ**

Dùng Grep trên `clients mutations components app lib __tests__` với từng mẫu; Expected: không kết quả.
- `blogClient\.(createPost|updatePost|deletePost|reportPost|addComment|deleteComment|uploadImage)`
- `userClient\.(updatePrivacy|markNotificationsRead|restoreAvatar|deleteAvatar)`
- `onboardingClient\.(saveStep|updatePreferences|complete|skip)`
- `/(blog/images|blog/comments/|onboarding/(preferences|complete|skip))`

- [ ] **Step 5: Kiểm trên dev server**

Mở preview, đăng nhập tài khoản A (đã xác minh email). Thử: tạo bài, sửa, xoá; bình luận, xoá bình luận; báo cáo bài người khác; chèn ảnh 1 MB và ảnh 7 MB (thấy "Images can be at most 5 MB"); bật tắt quyền riêng tư; đánh dấu đã đọc, gỡ thông báo; khôi phục và xoá avatar cũ; lưu bước, bỏ qua, hoàn tất onboarding. Expected: mọi thao tác thành công như trước. Tab Network: mỗi thao tác là `POST` tới URL trang, có header `Next-Action`; không còn lời gọi ghi tới `/api/blog`, `/api/user/{privacy,notifications,avatars}`, `/api/onboarding`.

- [ ] **Step 6: Kiểm quyền bằng hai tài khoản**

Với tài khoản B, trong console trang blog, gọi lại request `Next-Action` của A (copy từ Network) với id bài và id bình luận của A. Expected: sửa/xoá bài và xoá bình luận của A đều trả `{ success: false, status: 404 }`. Khôi phục avatar của A trả 404. Đăng xuất rồi bấm Like: 401. Tài khoản chưa xác minh email tạo bài: 403. `curl -X POST http://localhost:3000/api/onboarding/skip` → 404; `curl -X PATCH http://localhost:3000/api/user/privacy` → 405.

- [ ] **Step 7: Commit**

```bash
git add docs/api-conventions.md docs/superpowers/specs/2026-11-09-community-blog-design.md docs/superpowers/plans/2026-11-09-community-blog-p2.md
git commit -m "docs(api): route vs server action criteria; learner writes now go through actions"
```
