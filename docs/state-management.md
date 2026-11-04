# Quản lý state phía client

Quy ước cho mọi state mới và mọi lần sửa state cũ ở client.

## 1. State nào nằm ở đâu

| Loại state | Nơi giữ | Ví dụ |
|---|---|---|
| Dữ liệu từ server (đọc, cache, refetch, optimistic update) | **TanStack Query**: `queries/*.query.js`, `mutations/*.mutation.js`, key trong `keys/*.keys.js`, hydrate SSR qua `lib/hydrate.js` | khoá học, tiến độ, notification, ranks |
| Phiên đăng nhập | **next-auth** `useSession()`; refresh và đăng xuất qua `lib/authRefresh.js`, `components/auth/sessionWatcher.jsx` | `status`, `session.user.id` |
| State giao diện dùng chung giữa nhiều component | **Zustand**, file trong `stores/` | sidebar, theme, dialog level-up và đánh giá khoá học |
| State có thể chia sẻ bằng link, reload, back/forward | **URL** (`hooks/useListQueryState.js`, `components/admin/ui/useUrlFilters.js`, `?lesson=`) | bộ lọc danh sách, bài đang mở |
| State chỉ một component dùng | `useState` / `useReducer` trong component | ô input, tab đang mở trong một panel |
| Bản nháp code | IndexedDB qua `lib/drafts/draftStore.js` và `hooks/useCodeDraft.js` | code đang gõ trong challenge |

Không làm:

- Không copy dữ liệu server vào store Zustand. Cần dữ liệu đó ở nhiều nơi thì gọi cùng một `useQuery`.
- Không tạo React Context mới để chia sẻ state hay đổi. Context chỉ dùng cho giá trị gần như cố định theo cây (ví dụ `AdminProvider` mang quyền của admin).
- Không dùng `window.dispatchEvent` / `CustomEvent` làm kênh giữa component. Đặt state vào store.

## 2. Store hiện có

| Store | File | Giữ |
|---|---|---|
| `useUiStore` | `stores/uiStore.js` | `isSidebarOpen` (localStorage `codedev_dashboard_state`) |
| `useThemeStore` | `stores/themeStore.js` | `theme` (localStorage `theme`, cũng được `lib/themeScript.js` đọc trước khi paint), `toggleTheme` có View Transition |
| `useRewardsStore` | `stores/rewardsStore.js` | `levelUp`, `ratePrompt`, `rewardsSeq`; selector `selectRatePromptOpen` |

Hook tương thích: `useApp()` trong `contexts/appContext.jsx` chỉ còn `{ showAlert }` (hằng số, không subscription); `useTheme()` trong `contexts/themeContext.jsx` đọc `useThemeStore`. Code mới import `showAlert` từ `components/ui/alert.jsx` và dùng store trực tiếp.

Chưa làm: tiến độ challenge của bài học (`ChallengeProgressProvider` trong `components/learning/[id]/challengeSection.jsx`) vẫn dùng context và callback. Kế hoạch chuyển sang `stores/lessonProgressStore.js` chờ đến khi phần coding-snippets trong `components/learning/[id]/challenges/` được commit.

## 3. Tiêu chuẩn đặt tên và cấu trúc store

**File và export**

- Một store cho một domain: `stores/<domain>Store.js`, export `use<Domain>Store`. Không `export default`.
- Hằng số của store (`STORAGE_KEY`, `EMPTY_*`) đặt đầu file; `EMPTY_*` luôn `Object.freeze`.
- Store không import store khác. Cần ghép hai store thì ghép ở component hoặc ở hook trong `hooks/`.
- Tách store khi vượt khoảng 8 field state, hoặc khi hai nhóm field không bao giờ đổi cùng nhau.

**State (field)**

- camelCase, danh từ. Boolean có tiền tố `is` / `has` (`isSidebarOpen`).
- Thứ "đang mở / đang chờ" là một object, `null` khi không có (`levelUp`, `ratePrompt`). Không dùng cặp `xOpen` + `xData`.
- Bộ đếm sự kiện có hậu tố `Seq` (`rewardsSeq`).
- Collection theo khoá: `by<Key>` (ví dụ `byLesson`), giá trị là object bất biến; đọc khoá thiếu thì trả `EMPTY_*`, không trả `undefined`.
- Field có persist ghi một dòng comment ngay trên field: key, format, và ai khác còn đọc key đó.

**Action**

- Nằm cùng object với state, tên bắt đầu bằng động từ:
  - `set<Field>`: nhận giá trị hoặc hàm updater, như `useState`.
  - `toggle<Field>`, `open<Thing>` / `close<Thing>`, `show<Thing>`.
  - `mark<Fact>`: ghi một sự kiện đã xảy ra, idempotent.
  - `bump<Seq>`, `reset(key?)`, `hydrate()`.
- `hydrate()` là action duy nhất đọc storage, và chỉ được gọi trong `useEffect` sau mount (hiện tại: `ClientStateBridge` trong `contexts/providers.jsx`).
- Không có thay đổi thì updater trả về chính state hiện tại `s`, không trả `{}`. Zustand v5 chỉ bỏ qua cập nhật khi state trả về là cùng object; `{}` vẫn tạo state mới và báo mọi listener.
- `mark*` không tạo Set / object mới nếu giá trị đã có.
- Action không gọi `notify`, không điều hướng, không gọi React Query. Toast, hash URL, `invalidateQueries` nằm trong handler của component hoặc hook.

**Selector và giá trị dẫn xuất**

- Trong component: một field một selector, `useXStore((s) => s.field)`.
- Selector không trả object / array / Set mới (component sẽ render lại mỗi lần store đổi). Cần nhiều field trong một lần gọi thì dùng `useShallow` từ `zustand/react/shallow`.
- Selector dùng chung export từ file store, tiền tố `select`, trả primitive (`selectRatePromptOpen`).
- Hàm dẫn xuất thuần (không hook, không đọc store) tên `<noun>For(entry, ...)`, gọi trong render trên giá trị đã select.
- Ngoài React (util, mutation, hàm module như `announceRewards`): `useXStore.getState().action()`. Không gọi `useXStore.setState(...)` ngoài test.

**Hook tương thích**

- Hook cũ giữ chữ ký, bên trong gọi selector theo quy tắc trên, không tạo subscription thừa. Xoá khi không còn caller.

**Test**

- `__tests__/<area>/<domain>Store.test.js`. Mỗi test reset bằng `useXStore.setState(useXStore.getInitialState())`.
- Thêm `// @vitest-environment jsdom` chỉ khi store đọc `window` / `localStorage`.

## 4. Bất biến hydration

Với Cache Components, HTML server và lần render đầu ở client phải giống nhau:

- File store không đọc `window` / `document` ở top level; chỉ action đọc.
- State khởi tạo bằng đúng giá trị server render (`theme: "light"`, `isSidebarOpen: true`). Giá trị đã lưu trong trình duyệt được đọc bằng `hydrate()` sau mount.
- Không dùng middleware `persist`: nó lưu dạng `{"state":...,"version":0}`, sẽ phá `lib/themeScript.js` và giá trị người dùng đã lưu.
- Hệ quả đã chấp nhận (UX-301): người dùng đã thu sidebar vẫn thấy sidebar thu lại một lần sau khi tải trang. Đọc cookie ở server sẽ làm mọi route thành dynamic.

## 5. Quy tắc thứ tự dialog phần thưởng

Một lần hoàn thành bài có thể vừa lên level vừa xin đánh giá khoá học. Dialog đánh giá chỉ mở khi không có dialog level-up đang mở:

```js
export const selectRatePromptOpen = (s) => Boolean(s.ratePrompt) && !s.levelUp;
```

Thứ tự gọi `announceRewards` và `askForRating` không ảnh hưởng kết quả.
