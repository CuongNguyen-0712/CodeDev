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

## Trạng thái R1 + R2 (2026-11-03)

| Route | Trước | Sau | Kiểm chứng |
|---|---|---|---|
| `/course` | `○` nhưng thực tế CSR (skeleton) | `ƒ` SSR có cache: page đọc `searchParams`, parse bằng `lib/listFilters`, prefetch trang đầu qua `courseService.getList` (Redis) đúng viewer, rồi `HydrationBoundary` vào đúng key `courseQueries.list(params)` | HTML có 20 card theo đúng `?sort=`. Lúc tải không gọi `/api/course/courses`. Cuộn tải thêm 20 → 40. LCP mobile 4976 → 1586 ms (ảnh LCP lấy từ cache trình duyệt trong lần đo này), CLS 0 |
| `/roadmap` | `○` nhưng thực tế CSR | `ƒ` SSR: danh sách chung (Redis) được prefetch; filter trong URL nằm trong HTML | HTML có các link roadmap; lúc tải không gọi `/api/roadmap/list` |
| `/course/[id]` | `ƒ` SSR (đọc session) | `●` ISR: `revalidate = 300` (bằng `TTL.COURSE_DETAILS_PUBLIC`), `generateStaticParams` trả `[]` (tạo ở lần vào đầu). Page chỉ dùng dữ liệu public. Khoá không tồn tại trả 404; khoá chưa publish vẫn render để người sở hữu xem qua API. Ghi dữ liệu thì `revalidateCoursePage` (`lib/pageCache.js`) ở 4 chỗ đang xoá Redis public: `admin.service` `dropCatalogCaches`, `adminRating`, `courseRating`, đăng ký / rút khỏi khoá | `x-nextjs-cache` MISS rồi HIT, `s-maxage=300`. LCP 2264 → 1772 ms, TTFB 7 ms. Ảnh bìa thêm `fetchPriority="high"` (DevTools đề xuất sau lần đo) |
| Trạng thái viewer | Gộp vào `courseKeys.details` qua SSR có session | Query riêng `courseKeys.viewer(id)`, nằm dưới `details` nên mọi chỗ invalidate `details` cũng làm mới viewer. Route `GET /api/course/viewer-state` (khách nhận `null`). Hook `hooks/useCourseDetails` gộp hai phần; `viewerPending` giữ nút mua, tiếp tục học và yêu thích ở trạng thái loading cho tới khi biết viewer là ai. Optimistic yêu thích ghi vào key viewer | Đã đăng nhập: "Continue learning" + "In progress". Yêu thích đổi sau khoảng 66 ms, reload vẫn giữ |
| `/roadmap/[id]` | `ƒ` SSR (đọc session) | `●` ISR `revalidate = 600`: render bản khách. Người đã đăng nhập tải bản có tiến độ dưới key `roadmapQueries.details(id, "viewer")`, bản khách vẫn hiện trong lúc chờ | MISS rồi HIT; đã đăng nhập: 1 request `/api/roadmap/details`, không lỗi |
| `/profile/[id]` | `ƒ` `force-dynamic` | **Giữ nguyên** | Hồ sơ public phụ thuộc quyền riêng tư (ẩn hồ sơ, ẩn tiến độ, tài khoản bị khoá) và chưa có cache, nên nhiều chỗ ghi phải nhớ revalidate. Sót một chỗ là lộ dữ liệu cho tới khi hết hạn. Chỉ làm khi có một điểm invalidate chung cho mọi thay đổi hồ sơ |

Test 398 pass, lint 0 lỗi, build OK, `npm run budget` OK (`/course` 1103/1160 KB). Bỏ `<Suspense fallback={<LoadingRedirect />}>` (spinner toàn màn hình) ở hai trang chi tiết: không component nào trong đó dùng `useSearchParams`, và build vẫn qua.

Ghi chú cho Bước B: `generateStaticParams` trả `[]` không dùng được với Cache Components (cần ít nhất 1 param), nên lúc đó phải trả ít nhất một khoá đã publish.

## Bước B: kết quả thử và hướng thiết kế (2026-11-03)

### Đã thử (nhánh `feat/cache-components`, commit WIP `76172a6d`, chưa build được)

- Bật `cacheComponents: true`, bỏ 17 `dynamic = "force-dynamic"` và 4 `revalidate`; đặt `instant = false` cho `/admin` và `/studio`. `app/studio/` bị gitignore, nên nhánh không chứa thay đổi này: khi làm lại phải sửa tay (`force-dynamic` → `instant = false`).
- Thêm `lib/cachedData.js` (`'use cache'` + `cacheLife` + `cacheTag`), `lib/hydrate.js` (helper hydrate theo docs) và footer `'use cache'` (vì `new Date()`).
- Cách sửa này giải quyết được mọi lỗi phía server. **Điểm chặn:** `Date.now()` trong client component lúc prerender (`hooks/useCourseDetails.js` → `useQuery`). TanStack Query đọc thời gian khi tạo kết quả query (`timeUntilStale`). Docs Next ghi rõ: query cần cho lần render đầu phải nằm sau `<Suspense>`.
- Hệ quả: 59 file dùng `useQuery` / `useInfiniteQuery`, kể cả navbar, banner xác minh email và trung tâm thông báo trong shell, đều phải nằm sau `<Suspense>`. Phần đó không prerender được mà render lúc request. Với trang chi tiết khoá học, vốn đang là ISR tĩnh hoàn toàn (TTFB 7 ms), điều này là **lùi bước**: chỉ còn khung tĩnh, nội dung render lại mỗi request.

### Vấn đề gốc

Các trang công khai đang đọc dữ liệu **qua React Query ngay khi render** (server cấp dữ liệu ban đầu qua `HydrationBoundary`, rồi client component dùng `useQuery` để vẽ). Mô hình PPR giả định điều ngược lại: phần đọc là Server Component (cache được, prerender được), còn client chỉ lo tương tác. Đổi thư viện fetch phía client (SWR, v.v.) không giải quyết được, vì vấn đề nằm ở việc *đọc trong client lúc render*, không ở thư viện.

### Hướng đề xuất: "server-first reads, client islands"

| Lớp | Công nghệ | Dùng cho |
|---|---|---|
| Đọc dữ liệu public | Server Component + `'use cache'` / `cacheLife` / `cacheTag` (bọc service đang có, Redis vẫn ở dưới) | Nội dung trang công khai: landing, catalog, chi tiết khoá học / roadmap, about, blog, help |
| Đọc dữ liệu theo request | Server Component trong `<Suspense>` **nhỏ** (đọc session); có thể dùng `'use cache: private'` để Partial Prefetching chuẩn bị trước | Trạng thái viewer (đã ghi danh, sở hữu, tiến độ), lời chào, avatar trong navbar |
| Tương tác | Client component nhỏ ("island") nhận props từ server | Nút mua / ghi danh / yêu thích, bộ lọc, editor, comment, quiz |
| Ghi | Server Actions (đã có: `actions/*.actions.js`) + `updateTag` (đọc lại ngay sau khi ghi) / `revalidateTag(tag, "max")` + `router.refresh()` cho phần server | Mọi mutation |
| Trạng thái client và realtime | **Giữ TanStack Query**, chỉ dùng trong island hoặc trang private, luôn dưới `<Suspense>` | Trang private (learning, home, ranking, settings, orders), workspace bài học, comment, cuộn vô hạn; sự kiện Pusher → `invalidateQueries` hoặc `router.refresh()` |
| URL state | `useListQueryState` (đang có) đẩy URL; server render lại theo `searchParams` | Tìm kiếm / lọc catalog |

Không cần thêm thư viện. Thay đổi chính là **chuyển chỗ đọc** của trang công khai từ client sang server, và **thu nhỏ** phần client.

### Đích theo nhóm trang

- **Shell (layout):** sidebar, logo, link điều hướng và footer là Server Component tĩnh. Phần người dùng trong navbar (avatar, level, chuông thông báo, nút đăng nhập) tách thành island trong `<Suspense>` với skeleton cùng kích thước, nên không gây CLS.
- **Công khai** (`/`, `/course`, `/course/[id]`, `/roadmap`, `/roadmap/[id]`, `/about`, `/blog`, `/help`): nội dung là Server Component từ `'use cache'`, nằm trong static shell hoặc ISR theo URL. Island: `PurchaseActions`, yêu thích, đánh giá, comment (giữ React Query + Pusher dưới `<Suspense>`). Catalog: trang đầu render trên server theo `searchParams`; trang sau tải bằng island (server action "load more" hoặc API hiện có).
- **Private** (`/home`, `/learning`, `/ranking`, `/orders`, `/profile`, `/settings`, `/contact`, `/onboarding`, `/learning/[id]`): giữ client + React Query. Page chỉ gồm shell và một `<Suspense>` với skeleton bao phần nội dung. Không mất gì vì các trang này hiện đã là CSR.
- **Admin, studio, checkout, đơn hàng:** `instant = false`, render lúc request.

### Lộ trình đề xuất (thay R3-R5)

| Phase | Việc | Ước lượng | Kiểm chứng |
|---|---|---|---|
| B1 | Navbar: tách phần người dùng thành island trong `<Suspense>`; shell và footer là server. Chưa bật flag | 1 ngày | Không đổi hành vi; CLS = 0 |
| B2 | `/course/[id]` viết lại thành Server Component (tiêu đề, mô tả, syllabus, thống kê, ảnh) + các island. `useCourseDetails` chỉ còn cho island viewer | 1,5-2 ngày | LCP và TTFB không kém R2 |
| B3 | `/roadmap/[id]`, landing (kệ khoá học), about theo cùng mẫu | 1,5 ngày | |
| B4 | Catalog (`/course`, `/roadmap`): danh sách render trên server trong `<Suspense>` theo `searchParams`, `'use cache'` theo query; filter là island | 1,5 ngày | Cuộn vô hạn, lọc, sort như hiện tại |
| B5 | Private: mỗi page là shell + `<Suspense>`. Bật `cacheComponents` (dùng lại nhánh WIP: `lib/cachedData`, `lib/hydrate`, footer) | 1 ngày | `next build` qua, route table, smoke test |
| B6 | Bật `partialPrefetching`; `<Link prefetch>` cho các link catalog → chi tiết | 0,5 ngày | Điều hướng tức thì (prod) |

Tổng khoảng 7-8 ngày. B1-B4 đều có lợi **cả khi chưa bật Cache Components** (bớt JS client, nội dung là HTML thuần), nên dừng giữa chừng không bị phí.

Rủi ro:
- **Hai nguồn sự thật cho một màn hình:** server render và cache React Query. Quy tắc để tránh: phần server render là dữ liệu public; dữ liệu của viewer chỉ có ở island.
- **Realtime:** sự kiện Pusher đổi dữ liệu server render phải đi qua `revalidateTag` phía server (đã có điểm gọi trong service) hoặc `router.refresh()`.

## Trạng thái B1-B5 (2026-11-03)

| Phase | Commit | Đã làm |
|---|---|---|
| B1 | `b1501784` | `components/auth/signedIn.jsx`: banner xác minh email, `RankUpWatcher` và `LevelPointsChip` chỉ render khi đã đăng nhập (không bao giờ trên server). Menu tài khoản và chuông trong navbar vốn đã theo `status` |
| B2 | `900d2582` | `/course/[id]` là Server Component (`courseContent.jsx`, không hook). Island trong `courseIslands.jsx`: nút quay lại, badge ghi danh, nút mua / ghi danh / yêu thích, ảnh bìa, logo, comment, thanh mua trên điện thoại. `previewPage` là đường dự phòng phía client (khoá chưa publish, tải lỗi) |
| B3 | `2edc3541` | Kệ khoá học ở landing và about nhận dữ liệu qua props từ server. `/roadmap/[id]` render bản khách từ dữ liệu server; chỉ đọc React Query khi đã đăng nhập |
| B4 | `f1d36b78` | Catalog đọc `searchParams` / session trong component con. Sau đó đổi lại ở B5, xem bên dưới |
| B5 | (commit này) | `cacheComponents: true` (`partialPrefetching` vẫn `false`). Lấy lại từ nhánh WIP: bỏ 16 `force-dynamic`, `lib/cachedData.js` (`'use cache'` cho thống kê, kệ khoá học, khoá học public, kiểm tồn tại, roadmap public; id prerender sẵn), `lib/hydrate.js`, `lib/pageCache.js` dùng `revalidateTag(tag, "max")`, footer `'use cache'`. `apiRoute` gọi `connection()` trước khi đọc cookie (bỏ 37 log `HANGING_PROMISE_REJECTION` lúc build). `<Suspense>` + skeleton cho trang private và trang auth đọc React Query / thời gian lúc render. `instant = false` cho `/home` (redirect onboarding), `/profile/[id]`, `/learning/[id]`, `/orders/[id]`, `/checkout/mock/[orderId]`, `/admin`, `/studio` (thư mục bị gitignore, sửa tay) |

**Bài học ở B5:** khi nội dung chính của trang phụ thuộc request (danh sách catalog theo URL và viewer), đặt nó sau `<Suspense>` để có shell PPR là **lùi bước**. Nội dung được stream vào segment ẩn và chỉ hiện khi React reveal: `/course` LCP 1.6 s → 5.7 s trên mobile chậm. Vì vậy `/course` và `/roadmap` dùng `instant = false` và render chặn như R1 (LCP đo lại 1.94 s). PPR chỉ có ích khi phần động **nhỏ** so với phần tĩnh.

Kết quả bảng route (build có Cache Components):
- `○` tĩnh: `/`, `/about`, `/blog`, `/help`, `/auth/*`, các khung trang private.
- `○` cho 12 khoá mới nhất và mọi roadmap (prerender sẵn); `◐` cho id khác: khung chung, tạo theo URL ở lần vào đầu.
- `ƒ`: `/course`, `/roadmap`, `/home`.
- `◐` các route `[id]` per-request.

Kiểm chứng: test 398 pass, lint 0 lỗi, `npm run budget` OK (`/` 1102/1160 KB). Bản production local: các trang công khai trả 200; khoá không tồn tại 404. Khi đã đăng nhập: `/home`, `/learning`, `/ranking`, `/orders`, `/profile`, `/settings`, `/contact`, trang khoá học (nút viewer đúng) và workspace bài học (editor) không lỗi. `/course/[id]` là HIT, `x-nextjs-prerender: 1`, `s-maxage=300`; LCP 2.06 s, CLS 0.04 (R2: 1.77 s / 0.02).

**Đổi hành vi cần biết:** `/profile/<không tồn tại>` giờ trả **200** với trang "Page not found" và `noindex` (soft 404), thay vì status 404. Lý do: khung shell tĩnh đã gửi đi trước khi page gọi `notFound()`. Muốn có lại 404 thật thì đưa `/profile/[id]` ra khỏi route group `(shell)` hoặc cho layout biết sớm. Chưa làm.

## 7. Không làm

- Không cache trang có tác dụng phụ hoặc trạng thái tiền (`/orders/[id]`, `/checkout/*`, `/admin/*`).
- Không bỏ React Query: nó giữ cache phía client, mutation, realtime (Pusher) và cuộn vô hạn. Server chỉ cấp dữ liệu ban đầu.
- Không dùng `<Suspense>` bọc nội dung chính lớn (lý do ở §2, nhận xét 4).
