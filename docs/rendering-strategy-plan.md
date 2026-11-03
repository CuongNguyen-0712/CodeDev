# Kế hoạch chiến lược rendering theo từng trang

Ngày: 2026-11-03. Next.js 16.4.3 (App Router, Turbopack), React 19.3, TanStack Query 5. Deploy: Docker `output: "standalone"` (compose `app`); code có nhánh riêng cho Vercel (pool DB). Liên quan: [ui-ux/CLIENT_RENDER_AND_UX_PLAN.md](ui-ux/CLIENT_RENDER_AND_UX_PLAN.md) (đo đạc phía client), [performance-plan.md](performance-plan.md) (API, SQL, Redis).

Nguồn: docs đi kèm package, `node_modules/next/dist/docs/01-app/` (bản 16.4.3 đã cài, mới hơn kiến thức chung về Next): `01-getting-started/08-caching.md`, `02-guides/migrating-to-cache-components.md`, `adopting-partial-prefetching.md`, `authentication-with-cache-components.md`, `incremental-static-regeneration-cache-components.md`, `client-side-data-fetching/tanstack-query.md`.

## 1. Thuật ngữ trong Next 16.4

| Chiến lược | Ý nghĩa | Cách bật trong Next 16.4 |
|---|---|---|
| **CSR** | HTML chỉ có khung; dữ liệu do trình duyệt tải (ở đây: React Query gọi `/api/*`) | Client Component + `useQuery` |
| **SSR** | Render HTML mỗi request trên server | Page đọc `cookies()`, `headers()`, `searchParams` hoặc dữ liệu không cache |
| **SSG** | HTML tạo lúc build, phục vụ như file tĩnh | Page không có dữ liệu runtime (`○` trong bảng build) |
| **ISR** | SSG có hạn dùng: tạo lại sau N giây hoặc khi có sự kiện | Hiện tại: `export const revalidate = N`, `generateStaticParams`. Với Cache Components: `'use cache'` + `cacheLife()` + `cacheTag()` / `revalidateTag()` |
| **Streaming** | Gửi HTML theo từng phần; phần chậm nằm trong `<Suspense>` và đến sau | `<Suspense>`, `loading.jsx` |
| **PPR** (Partial Prerendering) | Một route có **static shell** prerender sẵn cộng các "lỗ" động stream vào cùng response | Next 16 bỏ `experimental.ppr`; PPR nằm trong `cacheComponents: true` |
| **Partial Prefetching** | `<Link>` prefetch **App Shell** chung của route (phần tĩnh + phần cache không phụ thuộc URL), dùng lại cho mọi link tới route đó | `partialPrefetching: true`, chỉ chạy khi có `cacheComponents` |

"ppg" trong yêu cầu được hiểu là PPR, khái niệm mới nhất trong nhánh này, cùng Partial Prefetching đi kèm nó trong Next 16.4. Docs ghi rằng cả hai sẽ bật mặc định ở bản major tiếp theo và các option sẽ bị bỏ.

Điểm cốt lõi của Cache Components (từ `08-caching.md`, `migrating-to-cache-components.md`):
- Dữ liệu không có `'use cache'` và các API runtime (`cookies`, `headers`, `searchParams`, `params` chưa có trong `generateStaticParams`) phải nằm trong `<Suspense>`. Nếu không, dev overlay báo "blocking route".
- `revalidate` được thay bằng `cacheLife`; `dynamic = "force-dynamic"` thì bỏ hẳn; `dynamicParams` không còn hỗ trợ; `generateStaticParams` phải trả ít nhất 1 param.
- `new Date()`, `Date.now()` và `Math.random()` trong phần prerender gây lỗi build. `instant = false` không bỏ qua được lỗi này.
- `dehydrate()` của TanStack gọi `Date.now()` lúc prerender, nên cần helper hydrate riêng: cache timestamp cùng tag với dữ liệu (`tanstack-query.md` §"Build a prerenderable hydration state").
- Client Component cũng được prerender. Query cần cho lần render đầu phải nằm sau `<Suspense>`.
- `'use cache'` mặc định lưu trong bộ nhớ của từng instance. Nhiều container hoặc serverless cần `'use cache: remote'` hoặc một `cacheHandlers` dùng chung.
- Có thể làm dần: codemod `cache-components-instant-false` đặt `export const instant = false` cho mọi segment, rồi chuyển từng route một.

## 2. Hiện trạng từng trang

Mức truy cập lấy từ `auth/route/*.route.js` (proxy redirect trước khi page chạy). Chế độ lấy từ bảng `next build` (`○` static, `ƒ` dynamic). Số đo lấy từ mobile giả lập (CPU 4×, Slow 4G), bản build local ngày 2026-11-03.

| Route | Truy cập | Chế độ hiện tại | Dữ liệu | Vấn đề |
|---|---|---|---|---|
| `/` | GUEST (đã đăng nhập thì sang `/home`) | ISR 10 phút (`revalidate = 600`) | Thống kê catalog trên server; kệ 4 khoá học tải bằng CSR | LCP 1616 ms, ổn. Kệ khoá học hiện sau |
| `/about` | công khai | ISR 10 phút | Thống kê trên server | LCP 1496 ms |
| `/blog`, `/help` | công khai | SSG | Tĩnh; help tìm kiếm phía client | Ổn |
| `/course` | PUBLIC | `○`, nhưng thực tế là CSR | `useSearchParams` khiến bản prerender chỉ có skeleton; danh sách tải bằng CSR | **LCP 4976 ms**: HTML → JS → `/api/course/courses` → ảnh |
| `/course/[id]` | PUBLIC | SSR mỗi request | `getAuthSession` + `getDetails` có `userId`, `HydrationBoundary`; `generateMetadata` gọi lại `getDetails` | Đọc session nên mọi khách cũng render lại; LCP ảnh 2264 ms |
| `/roadmap` | PUBLIC | `○`, thực tế CSR | Như `/course` | LCP 2428 ms |
| `/roadmap/[id]` | PUBLIC | SSR mỗi request | `getAuthSession` + `getDetails` | Như `/course/[id]` |
| `/profile/[id]` | PUBLIC | SSR, `force-dynamic` | `getPublicProfile` | Không cache dù là dữ liệu công khai |
| `/home` | PRIVATE | SSR | Server kiểm onboarding rồi redirect; widget tải bằng CSR | Chờ query onboarding trước khi gửi byte đầu |
| `/learning`, `/ranking`, `/orders`, `/profile`, `/settings`, `/contact`, `/onboarding` | PRIVATE | SSG khung + CSR | React Query + Pusher | Hợp lý: dữ liệu cá nhân, cập nhật realtime |
| `/learning/[id]` | PROTECTED | SSR | Metadata gọi `getDetails`; nội dung bài và editor là CSR | Ổn; editor đã lazy-load |
| `/orders/[id]`, `/checkout/mock/[orderId]` | PRIVATE | SSR | Trạng thái đơn hàng (poll) | Đúng: không được cache |
| `/auth/*` | GUEST | SSG | Form | Ổn |
| `/admin/*`, `/studio` | PRIVATE | SSR / CSR | Dữ liệu admin, Sanity Studio | `no-store`, `noindex` (đúng) |

Nhận xét chính:
1. Hai trang public quan trọng nhất về SEO và lượt vào (`/course`, `/roadmap`) đang là **CSR thật**, dù build đánh dấu `○`.
2. Trang chi tiết public (`/course/[id]`, `/roadmap/[id]`) là **SSR cho mọi người** chỉ vì đọc session để nhúng trạng thái của viewer. Service đã tách sẵn phần public (Redis `courseDetailsPublic`) và phần viewer (`getCourseViewerState`), nên tách render theo hai phần này rất tự nhiên.
3. Các điểm invalidate đã có (`admin.service`, `courseRating.service`, webhook Sanity xoá key Redis). Đây cũng là chỗ để gọi `revalidateTag`.
4. Bài học từ lần đo trước: `<Suspense>` bọc nội dung chính lớn khiến React đưa nội dung ra cuối HTML (`S:0`), nên chữ hiện trễ dù đã có trong HTML. Streaming chỉ nên dùng cho phần **thật sự** chậm hoặc phụ thuộc request, không bọc cả trang.

## 3. Nguyên tắc chọn

1. Nội dung giống nhau cho mọi người: SSG, hoặc ISR nếu dữ liệu đổi. Invalidate bằng tag tại đúng chỗ ghi; thời gian chỉ là lưới an toàn.
2. Trang public có phần cá nhân: shell và dữ liệu public được prerender hoặc cache; phần của viewer (đã ghi danh, tiến độ, nút mua) tải bằng CSR (đang có sẵn) hoặc stream trong `<Suspense>` (PPR).
3. Trang private, dữ liệu cá nhân, có realtime: SSG khung + CSR (giữ nguyên). Proxy đã chặn truy cập; server không cần đọc session chỉ để render khung.
4. Dữ liệu phải luôn mới và có tác dụng phụ (đơn hàng, checkout, admin): SSR, không cache.
5. Không bọc nội dung chính trong `<Suspense>` chỉ để "có streaming"; `<Suspense>` chỉ đặt quanh phần cần dữ liệu runtime.

## 4. Chiến lược đích

Bước A chạy trên mô hình hiện tại, rủi ro thấp và có thể làm ngay. Bước B là Cache Components + PPR + Partial Prefetching, đổi cả app.

| Route | Bước A (mô hình hiện tại) | Bước B (Cache Components / PPR) |
|---|---|---|
| `/` | ISR 10 phút; prefetch kệ 4 khoá học trên server (`HydrationBoundary`), để kệ có trong HTML | Shell tĩnh; thống kê và kệ dùng `'use cache'` + `cacheLife('minutes')` + tag `catalog` |
| `/about`, `/blog`, `/help` | Giữ SSG / ISR | Tĩnh hoàn toàn; thống kê dùng `cacheLife('hours')` |
| `/course` | **SSR có cache**: page await `searchParams`, prefetch đúng query đó qua `courseService.getList` (Redis đã cache) rồi `HydrationBoundary`. Trang hết bị CSR bailout, danh sách và ảnh đầu có trong HTML | **PPR**: tiêu đề, ô tìm kiếm, bộ lọc nằm trong shell; danh sách trong `<Suspense>` đọc `searchParams`, dữ liệu public dùng `'use cache'` theo query, tag `catalog`. Riêng danh sách cá nhân (ẩn khoá đã ghi danh) là phần runtime |
| `/course/[id]` | **ISR phần public**: `generateStaticParams` cho các khoá đã publish, `revalidate` dài, invalidate theo sự kiện (`revalidatePath` / `revalidateTag` trong `admin.service`, `courseRating.service`). Bỏ `getAuthSession` khỏi page; trạng thái viewer lấy bằng CSR (`getCourseViewerState`) | Shell = chi tiết public (`'use cache'`, `cacheTag('course:'+id)`); trạng thái viewer và nút mua stream trong `<Suspense>`. Comment đã có Pusher |
| `/roadmap` | Như `/course` (SSR có cache) | Như `/course` |
| `/roadmap/[id]` | Như `/course/[id]` | Như `/course/[id]` |
| `/profile/[id]` | ISR ngắn (`revalidate` khoảng 5 phút) thay cho `force-dynamic`; invalidate khi user đổi hồ sơ hoặc quyền riêng tư | `'use cache'` + tag `profile:'+id` |
| `/home` | Giữ SSR. Có thể chuyển kiểm onboarding vào proxy bằng cờ trong token để page thành khung tĩnh. Đây là thay đổi auth, **cần duyệt** | Shell tĩnh; lời chào và widget stream trong `<Suspense>`; kiểm onboarding nằm trong boundary |
| Các trang private khác | Giữ SSG khung + CSR | Giữ. Có thể thêm `'use cache: private'` cho dữ liệu đầu tiên để Partial Prefetching chuẩn bị trước khi bấm (tuỳ chọn) |
| `/learning/[id]` | Giữ SSR + CSR | Shell của workspace tĩnh; bài học dùng `'use cache'` theo lesson (đã có Redis + webhook Sanity); tiến độ stream |
| `/orders/[id]`, `/checkout/*`, `/admin/*`, `/studio` | Giữ SSR, `no-store` | `instant = false` hoặc để runtime; không cache |
| `/auth/*` | Giữ SSG | Tĩnh |

## 5. Lộ trình

Mỗi phase là một PR. Định nghĩa xong: lint, test, `next build`, `npm run budget`, đo lại LCP và CLS cho route bị đổi (cách đo như CLIENT_RENDER_AND_UX_PLAN §7).

### R1: Bước A cho trang danh sách (1-1,5 ngày)
- `/course` và `/roadmap`: page server đọc `searchParams`, parse bằng `lib/listFilters` (cùng code với API), prefetch trang đầu bằng service, `HydrationBoundary`. Client giữ `useInfiniteQuery` với cùng key (`courseQueries.list(params)`), nên cuộn tải thêm và đổi filter vẫn như cũ. Prefetch cần đúng viewer vì danh sách ẩn khoá đã ghi danh: đọc session soft như `/course/[id]` đang làm.
- Mục tiêu: LCP `/course` từ khoảng 5 s xuống dưới 2,5 s trên mobile chậm. Danh sách có trong HTML (SEO).

### R2: Bước A cho trang chi tiết (1,5-2 ngày)
- `/course/[id]`, `/roadmap/[id]`: page chỉ dùng dữ liệu public (đã cache Redis). Bỏ đọc session trong page. `generateStaticParams` + `revalidate`. Trạng thái viewer do client hỏi (`getCourseViewerState` đã có; cần route hoặc query riêng nếu chưa có).
- Gọi `revalidatePath('/course/'+id)` ở cùng chỗ đang `redis.del(courseDetailsPublic)`.
- `generateMetadata` và page dùng chung một lần gọi (`React.cache`), giống `/profile/[id]`.
- `/profile/[id]`: bỏ `force-dynamic`, dùng ISR + invalidate.
- Rủi ro: lúc hydrate, nút mua hoặc tiếp tục học hiện trạng thái khách trong một khoảnh khắc. Cần skeleton cho vùng nút để không gây CLS.

### R3: Bật Cache Components có kiểm soát (1 ngày + theo dõi)
- Nhánh riêng: `cacheComponents: true`, `partialPrefetching: false`. Chạy codemod `npx @next/codemod@canary cache-components-instant-false ./app` để mọi route build được.
- Sửa các lỗi bắt buộc: 13 file trong `components` / `app` có `Date.now()`, `new Date()` hoặc `Math.random()` (đã đếm); `export const revalidate` (2 file) đổi sang `cacheLife`; `dynamic = "force-dynamic"` (1 file); 2 chỗ `dehydrate()` (`app/course/[id]`, `app/roadmap/[id]`, cùng các page thêm ở R1) dùng helper hydrate prerender được.
- Thêm `cacheHandlers` dùng Redis (đã có `@upstash/redis` / `ioredis`) cho nhiều container, hoặc dùng `'use cache: remote'`.
- Kiểm: route table, dev overlay "blocking route" theo từng route.

### R4: Chuyển từng route sang PPR (2-3 ngày)
- Thứ tự theo lợi ích: `/course`, `/course/[id]`, `/roadmap`, `/roadmap/[id]`, `/`, `/learning/[id]`, `/home`, rồi các trang private.
- Mỗi route: bỏ `instant = false`, đưa dữ liệu public vào `'use cache'` + `cacheLife` + `cacheTag`, đặt runtime (session, `searchParams`) trong `<Suspense>` **nhỏ**, invalidate bằng `revalidateTag` / `updateTag` trong service và webhook Sanity.

### R5: Partial Prefetching (0,5-1 ngày)
- Hiện không có `<Link prefetch={...}>` nào (đã grep), nên không có full prefetch cũ cần chuyển. Bật `partialPrefetching: true`, xử lý insight "URL data outside of Suspense". Thêm `instant()` test nếu có môi trường test production.

## 6. Cần quyết định

1. **Làm Bước A trước rồi mới Cache Components (đề xuất), hay vào thẳng Bước B?** Bước A cho lợi ích đo được trong khoảng 3 ngày và không đổi mô hình. Bước B là migration toàn app; docs ghi nó sẽ thành mặc định ở bản major tiếp theo.
2. **Nơi lưu `'use cache'` khi deploy:** Docker một container dùng bộ nhớ là đủ; nhiều container hoặc Vercel cần handler dùng chung (Redis).
3. **Kiểm onboarding ở `/home`:** chuyển vào proxy là thay đổi auth, cần duyệt.
4. **Trạng thái viewer trên trang chi tiết:** chấp nhận tải bằng CSR (một request nhỏ, có skeleton) hay stream bằng PPR (chỉ có khi làm Bước B).

### Đánh giá và đề xuất (2026-11-03)

| Quyết định | Hiện trạng | Mức | Đề xuất |
|---|---|---|---|
| Nơi lưu `'use cache'` | Production chạy trên Vercel (`docs/environments.md`, production checklist); Docker standalone là phương án phụ. Chưa có `'use cache'` nào. Cache dùng chung hiện là Redis trong service (`redis.remember`, version key theo user), cộng ISR ở `/` và `/about` | Thấp: chỉ cần khi làm Bước B | Dùng `'use cache'` thường. Kết quả được prerender vào static shell hoặc output ISR thì bền: Vercel lưu nó, Docker lưu trong `.next`. Redis trong service vẫn là lớp cache runtime dùng chung, nên chưa cần `'use cache: remote'` hay `cacheHandlers` riêng (docs: nền tảng hosting thường tự cung cấp handler). Chỉ thêm handler Redis khi tự host **nhiều** container và đo thấy cache runtime bị miss nhiều |
| Kiểm onboarding của `/home` | Mỗi lần vào `/home`: một lần đọc session và một query DB có index, không cache (`onboardingDb.getState`). Lỗi thì cho qua (`false`). Chỉ người dùng mới có trạng thái pending | Thấp | **Giữ trong page, không chuyển vào proxy.** Muốn chuyển phải thêm cờ vào JWT và cập nhật token khi người dùng hoàn tất hoặc bỏ qua onboarding; token cũ có thể gây vòng redirect. Đó là thay đổi auth với lợi ích một query. Tuỳ chọn rẻ: cache trạng thái cuối (`completed` / `skipped` không bao giờ quay lại) trong Redis cache của user. Ở Bước B để `/home` chặn trên server (`instant = false`), vì redirect sau khi shell đã stream sẽ làm màn hình nháy |
| Trạng thái viewer trên trang chi tiết | `courseService.getDetails` ghép phần public (Redis) với 4 cột của viewer (`is_favorite`, `status`, `progress`, `owned`; một query có index) vào cùng key React Query `courseKeys.details(id)`. Page đọc session nên mọi request đều là SSR | Trung bình: khách vẫn nhanh nhờ Redis, nhưng trang không thể là ISR hay CDN | **Bước A: tải phía client.** Tách thành query riêng `courseKeys.viewer(id)` với một route GET nhỏ (khách nhận `null`). Vùng nút mua, ghi danh, yêu thích có skeleton để không gây CLS; mutation invalidate key này. Không dùng lại `details` cho viewer: dữ liệu public hydrate từ server sẽ còn "fresh" 30 s, nên client không hỏi lại và người đã đăng nhập sẽ thấy trạng thái khách. Việc tách này cũng là điều kiện của Bước B: lúc đó viewer stream trong `<Suspense>` và prefetch vào chính key ấy |

## 7. Không làm

- Không cache trang có tác dụng phụ hoặc trạng thái tiền (`/orders/[id]`, `/checkout/*`, `/admin/*`).
- Không bỏ React Query: nó giữ cache phía client, mutation, realtime (Pusher) và cuộn vô hạn. Server chỉ cấp dữ liệu ban đầu.
- Không dùng `<Suspense>` bọc nội dung chính lớn (lý do ở §2, nhận xét 4).
