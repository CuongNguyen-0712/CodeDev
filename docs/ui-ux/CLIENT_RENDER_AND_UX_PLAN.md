# Kế hoạch cải thiện UI/UX và tối ưu render phía client

Ngày rà soát: 2026-11-03. Nhánh `develop`, working tree còn 37 file sửa dở + 3 file mới (nextActionCard, achievementsSection, notificationCenter).

Bổ sung cho [UI_UX_MASTER_PLAN.md](./UI_UX_MASTER_PLAN.md) và [CURRENT_STATE_AUDIT.md](./CURRENT_STATE_AUDIT.md) (UI/UX, ID `UX-xxx`), và [../performance-plan.md](../performance-plan.md) (API/SQL). File này chỉ ghi phần **chưa có** trong các tài liệu đó: render phía client và các lỗi thấy khi chạy app ngày 2026-11-03. ID mới: `RC-xx` (render client), `UX-6xx` (UX mới).

Chưa làm: Lighthouse / trace trên bản `next build` (dev server chỉ cho số tham khảo), React Profiler, bundle analyzer. Mọi mức tác động dưới đây là ước lượng từ code; Phase 0 đo lại trước khi sửa.

## 1. Hiện trạng

**Đã tốt (giữ)**: token màu, shadcn, responsive 320-1440 không overflow, 0 lỗi axe, React Query có preset thời gian (`lib/queryTimes.js`), `keepPreviousData` ở list, infinite scroll, ảnh có `loading="lazy"`, landing dùng `PrismLight` chỉ đăng ký JavaScript, sidebar không còn nhảy sau hydrate, có `error.jsx` / `global-error.jsx` / `not-found.jsx`.

**Kiểm chứng khi chạy `localhost:3000` (dev)**

| # | Quan sát | Bằng chứng |
|---|---|---|
| V1 | `/course` **crash** ở màn hình lỗi "Something went wrong". Nguyên nhân là code đang sửa dở: `components/course/coursePage.jsx` thêm sort (`useState`, dòng 112) nhưng import chỉ có `useMemo` (dòng 2) | Console: `ReferenceError: useState is not defined at CoursePage` |
| V2 | Ảnh bìa khoá học tải bản 1600 px, hiển thị ở khoảng 160 px (10× số điểm ảnh theo chiều rộng) | `naturalWidth 1600`, `clientWidth 159` trên `/` |
| V3 | Trang chủ dev tải 32 file JS, 3,8 MB mã hoá. Số của dev (Turbopack, chưa minify), chỉ dùng làm dấu hiệu cần đo lại bản build | `performance.getEntriesByType('resource')` |

## 2. Phát hiện về render phía client

| ID | Vấn đề | Bằng chứng | Mức |
|---|---|---|---|
| RC-01 | Không có `next/image` và không có `srcset`: mọi ảnh khoá học / roadmap là `<img>` thường lấy URL gốc từ Cloudinary. `images.deviceSizes` và `qualities` trong `next.config.js` đã khai báo nhưng không dùng. Tốn băng thông, LCP chậm, không có `sizes` nên trình duyệt không chọn được bản nhỏ | `courseItem.jsx:129`, `recommendationCard.jsx:91`, `previewPage.jsx:414`, `orderStatusPage.jsx:166`; 0 file import `next/image` | High |
| RC-02 | Không có code splitting chủ động: 0 `next/dynamic` / `React.lazy`. Khối nặng đi cùng route đầu vào thay vì tải khi cần: editor, `react-syntax-highlighter` (bản `Prism` đủ mọi grammar), `@portabletext/react`, hộp thoại chung | `grep` toàn `components/` và `app/` | High |
| RC-03 | `react-syntax-highlighter` bản `Prism` (đủ grammar) ở `portableTextRenderer.jsx:5` và `codeEditor.jsx:4`. Landing đã dùng `PrismLight`, hai nơi nặng nhất thì chưa | 3 chỗ import, chỉ `components/index.js` là light | High |
| RC-04 | Editor tô màu lại **toàn bộ file** mỗi lần gõ (`useMemo` theo `value`, `codeEditor.jsx:558`). File dài cộng gõ nhanh gây trễ phím; không có `useDeferredValue` / `startTransition` | `codeEditor.jsx:558-567` | Medium |
| RC-05 | `Provider` (client, gốc mọi route) nạp sẵn `LevelUpDialog`, `RatePromptDialog`, `RankUpWatcher`, `AppToaster`, `SessionProvider` với `refetchInterval={60}` cộng `refetchOnWindowFocus`. Trang công khai (`/`, `/blog`, `/about`) cũng gánh những thứ chỉ người đã đăng nhập mới cần | `contexts/providers.jsx:9-31` | Medium |
| RC-06 | `HomeLayout` là `'use client'` toàn bộ (navbar, dashboard, footer, feedback). Mỗi page đều bọc `HomeLayout`, nên layout bị gắn lại và tải lại theo từng route thay vì là layout dùng chung của route group. `Footer` và phần tĩnh của landing vốn có thể là Server Component | `components/layouts/homeLayout.jsx:1`, mọi `app/*/page.jsx` | Medium |
| RC-07 | 138 file `'use client'`; mọi page đều là Server Component mỏng bọc một component client lớn (13 file > 400 dòng: `codeEditor` 702, `onboardingPage` 697, `codingChallenge` 654, `studyingPage` 653, `settingsPage` 611). Trạng thái cục bộ nằm cao nên đổi một ô là render lại cả cây | thống kê `wc -l` | Medium |
| RC-08 | Chỉ 70 lần dùng `useMemo` / `useCallback` / `memo` cho cả app; list khoá học render `CourseItem` không `memo`, mỗi item gắn ref callback `fitCover` + `onLoad` + `onError` inline. Với sort mới (đang viết), đổi sort tạo lại toàn bộ list | `courseItem.jsx:127-137`, `coursePage.jsx:226` | Medium |
| RC-09 | List dài (course, learning, contacts) tải thêm bằng `useInfiniteScroll` nhưng DOM chỉ tăng, không ảo hoá. Chấp nhận được dưới khoảng 100 mục; cần đo với catalog 41 khoá + 482 bài | `coursePage.jsx:101`, `contactPage.jsx:56` | Low |
| RC-10 | `fitCover` dùng `ref` + `onLoad` để tính object-fit theo từng ảnh; chạy đọc layout (`naturalWidth/Height`) cho mọi ảnh khi load, dễ gây layout thrash khi nhiều ảnh về cùng lúc | `courseItem.jsx`, `recommendationCard.jsx` | Low |
| RC-11 | Chưa có `loading.jsx` theo route ngoài `/admin`; fallback là `Suspense` + `PageSkeleton` bên trong từng page, nên cả `HomeLayout` chờ cùng page (UX-106 còn mở một phần) | `app/admin/loading.jsx` là file duy nhất | Low |
| RC-12 | 98 file import `react-icons/lu` / `/fa` / `/si` theo tên. Tree-shake được, nhưng cần xác nhận bằng analyzer rằng các subpath không kéo cả bộ icon vào chunk dùng chung | `grep` | Low (cần đo) |

## 3. Phát hiện UI/UX mới (ngoài UX-xxx đã có)

| ID | Vấn đề | Đề xuất | Mức |
|---|---|---|---|
| UX-601 | `/course` đang crash do code dở (V1): màn hình lỗi chung không cho biết nguyên nhân, nút "Try again" không giúp được | Sửa import; thêm test render cho `CoursePage` để bắt lại | High (chặn) |
| UX-602 | Sort mới: `sortedCourses` sắp xếp lại ở client trên các trang **đã tải**; "Sort by rating" khi mới tải trang đầu cho kết quả sai (khoá điểm cao ở trang sau không hiện). Vị trí sort khác filter, hai điều khiển cạnh tranh trạng thái | Đưa `sort` lên server (tham số API + `useListQueryState`, URL-driven như filter), hoặc đổi nhãn "Sort loaded courses" | Medium |
| UX-603 | Landing: khung editor mẫu chạy test ngay trên trang (`components/index.js`) có vẻ là phần nặng nhất của trang quảng bá (chưa đo) | Tải editor mẫu bằng `dynamic` sau `IntersectionObserver`; giữ khung tĩnh để không nhảy layout | Medium |
| UX-604 | Thông báo mới (`notificationCenter.jsx`, `nextActionCard.jsx`, `achievementsSection.jsx`) chưa commit, chưa có test; cần kiểm tra a11y (focus trap của popover, `aria-live`, trạng thái rỗng và lỗi) | Chạy lại axe + kiểm tra bàn phím trước khi merge; xem UX-107 | Medium |
| UX-605 | Ảnh lỗi: `onError` ẩn cả khung link ảnh (`parentElement.hidden`), card đổi chiều cao khác nhau giữa các hàng | Giữ khung `aspect-video` với placeholder nền `bg-muted` + icon | Low |
| UX-606 | `SessionProvider` poll mỗi 60 giây kể cả tab nền; cộng `AuthSessionWatcher` và Pusher, ba kênh làm tươi phiên | Chỉ giữ một: bỏ `refetchInterval`, dựa vào Pusher + `refetchOnWindowFocus` (cần kiểm tra với `docs/auth.md`, **thay đổi auth, cần duyệt**) | Low |

## 4. Kế hoạch theo phase

Mỗi phase một PR. Trước merge: `npm run lint`, `npm test`, `next build` không cảnh báo mới. Không đổi hành vi auth (ràng buộc cũ của kế hoạch UI/UX).

### Phase 0: Sửa lỗi chặn và đo baseline (0,5-1 ngày)

1. Sửa V1/UX-601 (`import { useMemo, useState }`), thêm test render `CoursePage` (Vitest + Testing Library, hiện chưa có test component; đây là bước đặt hạ tầng chung cho các phase sau).
2. Quyết định UX-602 (sort phía server hay đổi nhãn) trước khi commit phần sort.
3. Đo baseline trên `next build && next start`: Lighthouse mobile (4× CPU, Slow 4G) cho `/`, `/course`, `/course/[id]`, `/learning/[id]`; ghi LCP, TBT, INP, CLS, tổng JS mỗi route. Thêm `@next/bundle-analyzer` bật bằng `ANALYZE=1`. React Profiler cho gõ trong editor và đổi filter ở `/course`.
4. Ghi số vào bảng "Kết quả" cuối file này. Các mục Phase 1-3 chỉ giữ nếu số liệu xác nhận.

### Phase 1: Ảnh (1-1,5 ngày, rủi ro thấp, lợi nhiều nhất cho LCP)

- RC-01: tạo `components/ui/coverImage.jsx` bọc `next/image` (`fill`, `sizes` theo breakpoint của grid, `placeholder` nền `bg-muted`), dùng ở `courseItem`, `recommendationCard`, `previewPage`, `roadmapPage`, `orderStatusPage`. Remote pattern Cloudinary đã có. Ảnh đầu viewport (LCP) có `priority`; còn lại lazy.
- Hoặc, nếu muốn tránh bộ tối ưu ảnh của Next: thêm helper `cloudinaryUrl(url, { w, q: 'auto', f: 'auto' })` và `srcset`. Chọn một cách, không trộn. Mặc định đề xuất `next/image` vì config đã sẵn.
- RC-10 / UX-605: bỏ `fitCover` bằng JS nếu có thể (xử lý `contain` bằng CSS theo tỉ lệ khung hoặc lưu `fit` trong metadata ảnh); giữ khung ổn định khi lỗi.
- DoD: không còn `<img>` ngoài hai chỗ có lý do (QR, ảnh email); `naturalWidth` tối đa khoảng 2× `clientWidth`; CLS không tăng.

### Phase 2: Giảm JS ban đầu (2 ngày)

- RC-03: thay `Prism` bằng `PrismLight` ở `portableTextRenderer` và `codeEditor`; đăng ký danh sách ngôn ngữ thực dùng (đối chiếu `docs/sandbox.md` + ngôn ngữ trong nội dung Sanity). Tách `lib/syntaxHighlighter.js` đăng ký một lần.
- RC-02: `next/dynamic` cho: `CodeEditor` (và cả `codingChallenge`), `portableTextRenderer`, `LevelUpDialog`, `RatePromptDialog`, `Feedback`, `NotificationCenter` panel, editor mẫu ở landing (UX-603). Mỗi cái có fallback cùng kích thước.
- RC-05: tách `Provider` thành phần dùng chung công khai (Theme, Query, Toaster) và phần chỉ cho người đã đăng nhập (`LevelUpDialog`, `RatePromptDialog`, `RankUpWatcher`, realtime), gắn vào layout của route group đã đăng nhập.
- RC-12: đọc analyzer; nếu icon kéo cả bộ vào chunk dùng chung thì thêm `experimental.optimizePackageImports: ['react-icons/lu', ...]` trong `next.config.js` (kiểm tra mặc định của Next hiện tại trước).
- DoD: JS ban đầu của `/` và `/course` giảm theo mục tiêu đặt sau Phase 0 (đề xuất ≥ 25%); route learning chỉ tải editor khi vào lesson có challenge code.

### Phase 3: Cấu trúc layout và ranh giới client (2-3 ngày)

- RC-06: chuyển `HomeLayout` thành route group `app/(shell)/layout.jsx` (server) bọc các page dùng shell; chỉ phần cần state (navbar, sidebar, feedback) là client. `Footer` thành Server Component. Mỗi page bỏ `<HomeLayout>`. Đây là thay đổi chạm hầu hết `app/*/page.jsx`; thực hiện bằng codemod, kiểm tra từng route bằng Playwright smoke.
- RC-11: thêm `loading.jsx` cho các route chính để shell giữ nguyên trong lúc page suspend (đóng UX-106).
- RC-07: với 5 file lớn nhất, tách trạng thái xuống con (ví dụ editor: thanh công cụ, gutter, vùng nhập, bảng phím tắt là các component riêng có `memo`); không tách chỉ để tách, chỉ ở chỗ Profiler cho thấy render thừa.
- DoD: layout không remount khi đổi route trong cùng group (kiểm bằng log trong effect dọn dẹp tạm); không đổi URL hay hành vi auth.

### Phase 4: Render trong component (1-2 ngày)

- RC-04: highlight editor qua `useDeferredValue(value)`; lớp textarea vẫn cập nhật ngay, lớp tô màu theo sau. Giới hạn highlight theo cửa sổ nhìn thấy cho file rất dài nếu Profiler cho thấy cần.
- RC-08: `memo(CourseItem)` kèm props ổn định (callback bọc `useCallback`, bỏ handler inline trên `<img>`); sort dùng cùng danh sách đã `useMemo` (đã có). Áp dụng tương tự cho item của learning / contacts nếu Profiler xác nhận.
- RC-09: chỉ ảo hoá (`@tanstack/react-virtual`) nếu list thật vượt khoảng 150 mục sau khi tải; hiện không làm.
- RC-05 phần poll: UX-606 chỉ làm khi được duyệt thay đổi auth.
- DoD: gõ trong editor 500 dòng không có long task > 50 ms (trace); đổi filter ở `/course` không render lại item không đổi.

### Phase 5: UX còn lại (theo UI_UX_MASTER_PLAN, ưu tiên)

Giữ thứ tự của [IMPLEMENTATION_ROADMAP.md](./IMPLEMENTATION_ROADMAP.md); chỉ thêm các mục sau vào phase tương ứng:

- UX-602 sort phía server, UX-604 kiểm a11y thông báo trước khi merge, UX-603 editor mẫu landing.
- Còn mở từ audit cũ, đề xuất làm tiếp: UX-201 (ba độ rộng nội dung), UX-203/CI-01..06 (primitives dùng chung), UX-205 (`Empty` thay 20 khối rỗng tự vẽ), UX-207 (lỗi gắn field), UX-501/502/503 (React Query cho contacts, preset thời gian, `useMutation` cho settings).

### Phase 6: Chốt chất lượng (liên tục)

- Test component cho trang có list và filter (`CoursePage`, `LearningPage`) để lỗi kiểu V1 không lọt vào commit.
- Playwright smoke: `/`, `/course`, `/course/[id]`, `/learning/[id]` (đăng nhập tài khoản test), kiểm không có console error, chạy axe.
- Ngân sách hiệu năng trong CI: tổng JS ban đầu mỗi route và LCP bằng Lighthouse CI; fail khi vượt ngưỡng đặt sau Phase 0.

## 5. Thứ tự và ước lượng

| Phase | Nội dung | Ước lượng | Rủi ro |
|---|---|---|---|
| 0 | Sửa crash, đo baseline | 0,5-1 ngày | Thấp |
| 1 | Ảnh (`next/image`) | 1-1,5 ngày | Thấp |
| 2 | Tách code, `PrismLight`, tách Provider | 2 ngày | Trung bình (fallback, flash nội dung) |
| 3 | Layout server, `loading.jsx`, tách component lớn | 2-3 ngày | Trung bình-cao (chạm mọi page) |
| 4 | Render trong editor và list | 1-2 ngày | Thấp |
| 5-6 | UX còn lại, test, ngân sách CI | theo roadmap cũ | |

Tổng phần render khoảng 7-10 ngày công. Phase 1 và 2 cho lợi ích đo được nhanh nhất; Phase 3 chỉ làm khi số liệu Phase 0 cho thấy chi phí remount layout đáng kể.

## 6. Cần quyết định

1. ~~Ảnh: `next/image` hay URL Cloudinary có biến đổi.~~ Đã chốt: dùng `srcSet` Cloudinary (xem §7).
2. ~~Sort khoá học: phía server hay chỉ trên danh sách đã tải.~~ Đã làm phía server (§7, lượt 2).
3. Có duyệt UX-606 (bỏ poll phiên 60 giây) hay giữ nguyên do ràng buộc auth.
4. ~~Có đổi cấu trúc `app/` sang route group `(shell)` không.~~ Đã làm (§7, lượt 3).

## 7. Trạng thái (2026-11-03)

### Đã làm

| Mục | Thay đổi | Kiểm chứng |
|---|---|---|
| V1 / UX-601 | `coursePage.jsx` import `useState` | `/course` render 20 card, không còn màn hình lỗi |
| Lỗi cùng loại | `settingsPage.jsx` `PhotoSection` dùng `avatarError` / `setAvatarError` mà không khai báo (chọn ảnh đại diện là crash) | Thêm `useState(null)` |
| Chặn tái diễn | `eslint.config.mjs`: bật `no-undef` (file `.cjs` dùng globals Node); thêm `globals` vào devDependencies | `npx eslint .`: 0 lỗi, 19 cảnh báo có từ trước |
| Review diff dở | `userQueries.users`: thêm `enabled` theo session, key theo chuỗi đã trim; `contactPage` giữ skeleton lúc session đang tải. `achievementsSection`: mô tả huy hiệu có bản `sr-only` (tooltip không tới được bằng bàn phím), bỏ `text-[10px]`. `footerPreview`: ẩn `PurchaseActions` ở header khi màn hình < sm và đã có dữ liệu, để mỗi trang chỉ có một checkout (thanh dưới đã có) | Mobile 375 px: chỉ còn 1 nút "Sign in to enroll" |
| RC-01 | Không dùng `next/image`: URL bìa trong DB đã là transform Cloudinary `c_limit,w_1600/f_auto,q_auto`, nên chỉ cần `srcSet` (320-1600w) + `sizes`. Đã chọn cách này vì không tốn CPU máy chủ cho bộ tối ưu ảnh của Next. `lib/coverFit.js` `coverSrcSet()` + test; dùng ở `courseItem`, `previewPage`, `recommendationCard`, landing | `/course`: 20 ảnh có `srcset`, trình duyệt chọn `w_960` thay vì `w_1600` ở card 586 px |
| RC-03 | `lib/syntaxHighlighter.js`: `PrismLight` với 36 grammar mà nội dung bài học và editor dùng; `portableTextRenderer` và `codeEditor` import từ đây | Build OK; chưa đo trên `/learning/[id]` (cần đăng nhập) |
| RC-02 (một phần) | `Feedback` (kéo cả `zod` + schema, khoảng 106 KB) chỉ tải khi URL có `?modal=feedback`. `UserRealtimeBridge` chỉ tải khi đã đăng nhập. `lib/authNavigation.js` bỏ import tĩnh `pusher-js`: `pusherClient` tự đăng ký hàm ngắt kết nối khi tạo socket | Modal feedback mở và gửi được form; `pusher-js` chỉ còn ở `/course/[id]` (comment realtime), `zod` chỉ còn ở `/auth` |

Test: `npx vitest run` 386/387 pass. `__tests__/sandbox/stdio.test.js` fail một lần khi chạy cả bộ (timeout 60 s dưới tải) và pass 12/12 khi chạy riêng. `next build` OK.

### Kết quả đo

Bản `next build` chạy local (`next start -p 3100`, launch config `codedev-prod`). Đo tổng JS mà HTML ban đầu tham chiếu (chưa gzip, không tính prefetch):

| Route | Trước (build 2) | Sau (build 3) | Ghi chú |
|---|---|---|---|
| `/` | 1165 KB, có `pusher-js` | 1106 KB | build 1 còn `zod` (đo theo cách khác: 1171 → 1055 KB decoded) |
| `/course` | 1164 KB | 1105 KB | |
| `/course/[id]` | 1119 KB | 1119 KB | giữ `pusher-js` cho comment |
| `/roadmap` | 1135 KB | 1076 KB | |
| `/blog` | 1087 KB | 1028 KB | |

Phần còn lại chủ yếu là framework: `react-dom` 202 KB, router Next 129-156 KB, Radix khoảng 160 KB, `axios` 55 KB, `sonner` 37 KB.

**Chưa đo được:** LCP, TBT và CLS bằng Lighthouse. Bản build local gọi API ở `http://localhost:3000` (giá trị `NEXT_PUBLIC_*` được gắn lúc build), nên khi chạy ở cổng 3100 thì dữ liệu không tải được. Muốn đo cần chạy bản build ở cổng 3000 thay cho dev server. Các trang cần đăng nhập (`/home`, `/learning/[id]`, `/settings`, `/profile`) chưa kiểm tra trên trình duyệt vì không có tài khoản test được ghi lại trong repo.

### Lượt 2 (2026-11-03)

| Mục | Thay đổi | Kiểm chứng |
|---|---|---|
| UX-602 | Sort khoá học chạy phía server. `LIST_SORTS` + `?sort=` trong `lib/listFilters.js`: tách khỏi filter, nên không bị tính là filter đang bật và không hiện chip; vẫn nằm trong cache key. `db/course.db.js` `COURSE_SORTS`: keyset theo (khoá sort, `c.id`), unrated xếp sau. "Clear filters" giữ nguyên sort. Select có nhãn | Unit test parse/serialise; integration test trên PostgreSQL phân trang 3 thứ tự với `limit 3`, không lặp, không sót; trên trình duyệt `?sort=title` đổi URL, đúng thứ tự, không hiện "Clear" |
| Thông báo | Trạng thái đã đọc lưu `localStorage` theo user. Id gồm giá trị (`level-N`, `course-completed-N`) nên lên level / xong khoá mới lại hiện là mới; chỉ giữ id còn đang hiển thị. `motion-safe:` cho chấm ping, chữ `text-xs`, nhãn `sr-only` "Unread" | Lint; **chưa** kiểm trên trình duyệt (cần đăng nhập) |
| Admin table | Bỏ `sticky top-0` không có tác dụng trên `thead` (`accessAdmin`, `ordersAdmin`, `catalogPage`) | |
| RC-02 | `QuizChallenge` / `CodingChallenge` tải bằng `next/dynamic` với skeleton `role="status"`: bài chỉ có quiz không tải editor | Build/lint; **chưa** kiểm trên `/learning/[id]` |

Test cả bộ: 392 pass, 12 skip (cần dịch vụ ngoài). Lint 0 lỗi.

### Lượt 3 (2026-11-03): Phase 3

| Mục | Thay đổi | Kiểm chứng |
|---|---|---|
| RC-06 | 15 page dùng shell chuyển vào route group `app/(shell)/`: `/`, about, blog, contact, help, home, ranking, settings, orders (+`[id]`), profile (+`[id]`), và trang danh sách của `course`, `learning`, `roadmap` (trang `[id]` của ba route này vẫn dùng DefaultLayout, nằm ngoài group). `app/(shell)/layout.jsx` mount `HomeLayout` một lần; các page bỏ `<HomeLayout>` và giữ `Suspense` + `PageSkeleton` (cần cho `useSearchParams`). `/orders/[id]` đổi từ spinner toàn màn hình sang `PageSkeleton` | `next build`: route table giống hệt trước (cùng URL, cùng static/dynamic). Đổi trang bằng link: shell giữ nguyên (cùng DOM node), vùng cuộn `#container` về 0 |
| RC-11 | `app/(shell)/loading.jsx` (`PageSkeleton`) cho lúc page chờ server, ví dụ `/home` kiểm onboarding | |
| Footer | `Footer` render trên server và truyền vào `HomeLayout` qua prop `footer`, không còn nằm trong bundle client của layout | |
| Kiểm signed-in | Tài khoản test local mới tạo thẳng trong DB local, email đã xác minh. Tạo thẳng vì đăng ký qua `/auth` sẽ gửi mail xác minh: dev gửi tới mailpit, còn bản `next start` local cấu hình Gmail SMTP. Thông tin đăng nhập ở `.env.local` (`TEST_USER_*`, không commit). `.env.local` cũng có sẵn `LOCAL_TEST_USERNAME` từ đợt audit trước | Đăng nhập → onboarding (bỏ qua) → `/home`. Render OK, không lỗi: `/home`, `/learning`, `/ranking`, `/orders`, `/profile`, `/settings`, `/contact`, `/course`, `/course/[id]`. Thông báo: "Mark all read", reload vẫn 0 chưa đọc. Lesson: quiz tải qua `next/dynamic`, editor của bài có coding challenge tải được, gõ và tô màu đúng; code block trong bài tô màu bằng `PrismLight` |

Lint 0 lỗi; test 392 pass; build OK.

### Lượt 4 (2026-11-03): Phase 4-6 và đo Web Vitals

| Mục | Thay đổi | Kiểm chứng |
|---|---|---|
| RC-04 | Editor tô màu bằng một chuỗi HTML (`highlightToHtml` trong `lib/syntaxHighlighter.js`): cùng token Prism, cùng theme, chữ được escape, style chỉ lấy từ theme. Không còn tạo hàng nghìn React element mỗi phím. Không dùng `useDeferredValue` vì chữ hiển thị sẽ trễ hơn textarea | Đo trên bản dev, mỗi phím: 503 dòng 168 → 58 ms, 53 dòng 152 → 33 ms. Chữ của lớp tô màu khớp textarea; màu Dracula giữ nguyên. Có test (`__tests__/ui/syntaxHighlighter.test.js`) |
| Hydration modal feedback | `FeedbackGate` chỉ mở dialog sau khi trang hydrate xong (`requestIdleCallback`, Safari dùng `setTimeout`) | `/course?modal=feedback`: dialog mở, console không lỗi |
| LCP | (1) Bỏ `app/(shell)/loading.jsx`. (2) Bỏ `Suspense` + `PageSkeleton` ở 9 page không dùng `useSearchParams` (`/`, about, blog, home, profile, settings, contact, help, `orders/[id]`). Lý do: React tách nội dung của một boundary lớn ra cuối HTML (`<div hidden id="S:0">`) và chỉ hiện khi script `$RC` chạy, nên chữ đã có trong HTML vẫn hiện trễ. `next build` báo lỗi nếu page nào thật sự cần `Suspense`, và build vẫn qua | Trace mobile (CPU 4×, Slow 4G), `/`: LCP 2381 → 1616 ms |
| LCP `/course` | Ảnh bìa của 2 card đầu dùng `loading="eager"` + `fetchPriority="high"` | 5772 → 4976 ms. Phần còn lại là danh sách tải phía client rồi mới tải ảnh. Muốn giảm thêm cần prefetch danh sách phía server (hydrate React Query), chưa làm |
| CLS | `#container > :not(footer)` có `min-h-dvh`: footer luôn bắt đầu ở dưới màn hình, không hiện ở đáy rồi bị nội dung tải phía client đẩy xuống | `/roadmap` CLS 0.291 → 0.001; các route công khai khác ≤ 0.017 |
| UX-205 | 10 khối empty state tự vẽ đổi sang `Empty` dùng chung: commentPage, helpPage, recommend, learningPage, onboardingPage, rankingPage ×2, roadmapPage, roadmapDetailsPage, settingsPage. Padding và icon theo mặc định của component, giống coursePage và ordersPage | Lint; trên trình duyệt xem phần kiểm tra cuối lượt |
| UX-502 | `challengeQueries.workspace` dùng preset `QUERY_TIMES.personal` | |
| Phase 6 | Test component: `@testing-library/react` + `jsdom`; file `*.test.jsx` tự bật `// @vitest-environment jsdom`. Một plugin Vite nhỏ cho phép JSX trong file `.js` của dự án (như Next). `__tests__/ui/coursePage.test.jsx` render trang catalog thật, chỉ giả lập network, router và session | Đã thử bỏ import `useMemo`: test fail với `useMemo is not defined` |
| Ngân sách JS | `npm run budget [-- url]` (`scripts/bundle-budget.mjs`): cộng JS mà HTML ban đầu tham chiếu, fail khi vượt ngưỡng (khoảng 5% trên số đo) | Bản build hiện tại: mọi route trong ngân sách (`/` 1106/1160 KB) |

Không làm, kèm lý do:
- **UX-404** (toast 4xx thành màu đỏ): `400` đang dùng cho kết quả không chặn việc, như điểm quiz một phần hay chưa qua hết test. Đổi sang đỏ sẽ báo sai mức độ.
- **UX-503** (`useMutation` cho settings): form đã tự xử lý pending, lỗi và `onSaved`. Đổi chỉ tăng code, người dùng không thấy khác.
- **Tách `Provider` theo đăng nhập:** `level.jsx` vẫn được `mutations/` import tĩnh, nên lợi ích gần như bằng 0.

**Ghi chú vận hành:** chạy `next build` trong lúc `next dev` đang chạy làm `.next/dev` lệch. Dev server dừng hoặc biên dịch lại liên tục (trang tự reload mỗi giây). Cách sửa: dừng dev, xoá `.next/dev`, chạy lại.

Đo Web Vitals: dev server ở cổng 3000, nên bản build để đo chạy ở cổng 3100 với `NEXT_PUBLIC_API_URL=http://localhost:3100/api`. Sau khi đo, `.next` đã được build lại với cấu hình bình thường.

### Còn mở

- **LCP `/course` khoảng 5 s trên mobile chậm:** cần render danh sách phía server (prefetch + `HydrationBoundary`), đổi luồng dữ liệu của trang.
- **Proxy:** giờ gắn `next` cho mọi trang private (UX-104); `safeNextPath` đã chặn URL ngoài và `/auth`.
- **Audit cũ chưa làm** (cần quyết định thiết kế): UX-201 (ba độ rộng nội dung), UX-202 (`PageHeaderBar` dùng chung), UX-203 / CI-01..06 (primitive dùng chung cho progress bar và collapsible), UX-206 (cỡ h1), UX-303 (nút 24 px trên màn hình cảm ứng).
