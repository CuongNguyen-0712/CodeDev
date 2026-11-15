# Team — thiết kế

Date: 2026-11-14. Status: implemented. Sub-project 3/3 của "message chat" (spec lõi: `2026-11-11-chat-core-design.md` §1; sub-project 2: `2026-11-13-friends-design.md`).

## 1. Mục đích

Team **chỉ phục vụ chat**: một nhóm chat tối đa 5 người do chủ team lập và mời bạn bè vào. Không có trang tìm team, không xin vào team.

Hiện trạng:

- `community.team` (`id varchar(50)` PK, `name varchar(20)`, `size` CHECK 2–5, `host_id`, `image_url`, `description`, `created_at`, `updated_at`) và `community.team_members` (`id`, `team_id`, `user_id`, `status` ∈ `pending | approved | rejected | left | kicked`, `created_at`, `updated_at`; `uq_team_member (team_id, user_id)`; `idx_team_members_user (user_id, status)`; `idx_team_host`). Chưa có code nào ghi vào hai bảng.
- Chat đã sẵn chỗ nối:
  - `chatService.ensureTeamConversation(teamId)` tạo (idempotent) hội thoại `kind = 'team'`;
  - `chatService.syncTeamMember(teamId, userPublicId, "joined" | "left")` thêm / bỏ người khỏi hội thoại team rồi phát realtime chat;
  - `chatDb.areClose` coi người cùng team `approved` là "quen" (1-1 không qua hộp chờ);
  - `community.conversation.team_id … ON DELETE CASCADE`: xóa dòng team thì hội thoại team và tin nhắn bị xóa theo.
- Bạn bè (sub-project 2) đã có: `socialService` (`friendship`), `/contact` ba tab, `notificationService.notify`, event `friend-updated`, cache vá tại chỗ (`lib/social/friendCache.js`).

## 2. Mục tiêu, không làm, phản mục tiêu

**Mục tiêu**

- Tạo team (tên + mời bạn bè), chấp nhận / từ chối lời mời, mời thêm, đuổi, đổi tên, rời team.
- Chủ rời → tự chuyển chủ cho người vào sớm nhất còn lại; người cuối rời → team kết thúc (xóa team, hội thoại xóa theo).
- Người trong team nhắn được trong hội thoại team; người rời / bị đuổi mất quyền đọc và gửi.

**Không làm**: trang tìm team, xin vào team, ảnh và mô tả team, nhiều chủ, đổi `size`, chuyển chủ thủ công.

**Phản mục tiêu**

- Mời được người không phải bạn, người có chặn với mình, hoặc người bị khóa (`status <> 'active'`).
- Team vượt 5 người (tính cả lời mời đang chờ).
- Team không còn chủ, hoặc còn dòng team mà không ai ở trong.
- Người đã rời / bị đuổi vẫn đọc được tin mới.

## 3. Cách làm đã cân nhắc

| | Cách | Đánh đổi |
|---|---|---|
| **A (đã chọn)** | `services/team.service.js` + `db/team.db.js` riêng, khuôn của bạn bè; gọi `ensureTeamConversation` / `syncTeamMember` của chat | Thêm file, nhưng tách bạch; chat gần như không đổi |
| B | Gộp vào `social.service.js` | Ít file, nhưng file vượt ~300 dòng (ngưỡng spec bạn bè đặt) và trộn hai vòng đời khác nhau |
| C | Bỏ bảng team, team = hội thoại `kind = 'team'`, lời mời = thành viên chat `pending` | Ít bảng nhất, nhưng phải viết lại phần chat đang đọc `community.team` / `team_members` |

User chọn A (2026-11-14). Cách vào team: chỉ chủ mời (user chọn). Chủ rời: tự chuyển chủ (user chọn).

## 4. Dữ liệu

- **Id team**: `community.team.id` là `varchar(50)`; dùng luôn chuỗi `team_<ulid 26 ký tự thường>` làm id công khai (giống `cnv_` / `msg_` của chat). Không thêm cột `public_id`.
- `size` luôn ghi `5` (mức trần CHECK cho phép). `image_url`, `description` để mặc định.
- Migration mới (số kế tiếp còn trống tại lúc code — một session khác đang làm việc song song và có thể thêm migration): thêm `community.team_members.joined_at timestamp` (NULL khi chưa vào), backfill `joined_at = COALESCE(updated_at, created_at)` cho dòng `approved` đang có; index `(team_id, status, joined_at, id)` để tìm người kế nhiệm và liệt kê thành viên theo thứ tự vào.
- Ý nghĩa trạng thái thành viên:

| `status` | Nghĩa |
|---|---|
| `pending` | đã được mời, chưa trả lời |
| `approved` | đang trong team (`joined_at` = lúc vào) |
| `rejected` | đã từ chối lời mời |
| `left` | đã rời |
| `kicked` | bị chủ đuổi |

Mỗi cặp (team, người) một dòng (`uq_team_member`); mời lại người đã `rejected / left / kicked` thì cập nhật dòng đó thành `pending` và `updated_at = now()` (thời điểm mời, dùng cho `dedupeKey` và keyset lời mời).

*Quyết định của người viết spec (sau builder check):* migration backfill `joined_at` dù hiện chưa có code ghi team, để dòng cũ (nếu production có) vẫn có thứ tự chuyển chủ. Trước khi deploy, kiểm tra trên production `SELECT count(*) FROM community.team` — nếu khác 0, xem lại các team đó (hội thoại team được tạo lười ở luật 4 nên không cần sửa dữ liệu).

## 5. Luật

Mọi thao tác ghi: một transaction, `SELECT … FOR UPDATE` dòng `community.team` trước (khóa cả team), rồi mới đọc / ghi `team_members`. Chat được gọi **sau commit** (luật 10).

1. **Tạo team** (`name`, `memberIds` 1–4 người):
   - `name`: trim, bỏ ký tự điều khiển bidi / C0 / C1 (như R44 của chat), 1–20 ký tự sau khi làm sạch; sai → 400.
   - Mỗi người trong `memberIds` phải hợp lệ để mời (luật 3); một người không hợp lệ → cả lệnh trả lỗi, không tạo gì.
   - Tạo `community.team` (`host_id` = người tạo, `size = 5`), dòng `team_members` của chủ `approved` (`joined_at = now()`), dòng `pending` cho từng người được mời.
   - Sau commit: `ensureTeamConversation`, `syncTeamMember(…, chủ, "joined")`, thông báo mời (mục 6).
2. **Mời thêm** (chỉ chủ; `userIds` ≥ 1): mỗi người hợp lệ để mời; tổng `approved + pending` sau khi mời ≤ 5, nếu vượt → 409 "This team is full". Người đã `approved` hoặc `pending` → bỏ qua (idempotent).
3. **Hợp lệ để mời**: là **bạn** của chủ (`community.friend` `accepted`), `status = 'active'`, không có chặn theo chiều nào. `show_profile` **không** chặn mời team: như luật 8 của bạn bè, ẩn hồ sơ chỉ chặn việc được tìm thấy và lời mời kết bạn mới, còn bạn bè đã có vẫn nhắn được *(quyết định của người viết spec)*. Sai → 404 cho người không tồn tại / không active, 403 "Can't invite this person" cho không phải bạn hoặc có chặn (không nói lý do).
4. **Trả lời lời mời** (người được mời, dòng `pending`): chấp nhận → `approved`, `joined_at = now()`, rồi sau commit gọi `ensureTeamConversation` (idempotent, phòng khi lần gọi lúc tạo team đã lỗi) rồi `syncTeamMember(…, "joined")` *(quyết định của người viết spec)*. Người vào lại sau khi rời / bị đuổi thấy toàn bộ lịch sử nhóm như các ứng dụng chat nhóm khác; chat không đổi; từ chối → `rejected`. Không còn `pending` → 409. Chấp nhận khi team đã đủ 5 `approved` (không xảy ra nếu luật 2 giữ đúng, nhưng vẫn kiểm) → 409.
5. **Đuổi** (chỉ chủ, không đuổi chính mình): người đó `approved` → `kicked`; `pending` → `kicked` (rút lời mời). Sau commit: `syncTeamMember(…, "left")` nếu đã `approved`.
6. **Đổi tên** (chỉ chủ): như validate ở luật 1. Sau commit: `chat-conversation-updated` cho mọi thành viên `approved` để hộp thư cập nhật tên.
7. **Rời team** (thành viên `approved`): → `left`, `joined_at` giữ nguyên. Sau commit: `syncTeamMember(…, "left")`.
   - Nếu người rời là chủ: chủ mới = thành viên `approved` có `joined_at` sớm nhất (hòa thì `id` nhỏ hơn); cập nhật `team.host_id` trong cùng transaction.
   - Nếu không còn ai `approved`: xóa dòng `community.team` (dòng `team_members` và hội thoại team xóa theo bằng cascade / FK). Lời mời `pending` biến mất theo. Không gọi `syncTeamMember` (hội thoại đã bị xóa); thay vào đó phát `team-updated` `ended` cho người rời và người còn lời mời — client bỏ hội thoại khỏi cache hộp thư và rời trang nếu đang mở *(quyết định của người viết spec)*.
   - **Xóa tài khoản** (`db/accountPurge.db.js`, chỉ áp dụng tài khoản chưa xác minh): trong cùng transaction, trước `DELETE FROM identity.users`, áp dụng luật 7 cho mọi team người đó đang ở (chuyển chủ hoặc kết thúc team), vì `fk_team_host` là `ON DELETE CASCADE` và sẽ xóa cả team của 4 người còn lại *(quyết định của người viết spec)*.
8. **Chặn**: không đổi team (người đã cùng team vẫn cùng team); chỉ chặn việc mời mới (luật 3).
9. **Quyền đọc team**: chỉ thành viên `approved` xem danh sách thành viên; người được mời (`pending`) chỉ thấy tên team và người mời trong lời mời của mình.
10. **Thứ tự**: lệnh chat (`ensureTeamConversation`, `syncTeamMember`), thông báo và event chạy sau commit qua `runAfter`, lỗi chỉ log. `syncTeamMember` idempotent nên chạy lại không hỏng.

## 6. Bề mặt API

Đọc qua route `GET` + React Query, ghi qua server action `runAction`, như bạn bè. Lỗi validate 400.

**Server action** (`actions/team.actions.js`; limiter mới `rateLimiters.team` = 30 / 60 s, prefix `"team"`):

| Action | Trả về |
|---|---|
| `createTeamAction({ name, memberIds })` | `{ team }` |
| `inviteToTeamAction({ teamId, userIds })` | `{ team }` |
| `respondTeamInviteAction({ teamId, accept })` | `{ team \| null, conversationId \| null }` |
| `removeTeamMemberAction({ teamId, userId })` | `{ team }` |
| `renameTeamAction({ teamId, name })` | `{ team }` |
| `leaveTeamAction(teamId)` | `{ team: null }` |

`team` = `{ id, name, hostId, memberCount, pendingCount, conversationId }` (góc nhìn thành viên).

**Route `GET`**:

| Route | Trả về |
|---|---|
| `GET /api/teams/[id]/members` | thành viên `approved` (theo `joined_at`) + `pending` (cho chủ), shape người như `/api/friends`, thêm `role: "host" \| "member" \| "invited"`; 404 nếu người gọi không `approved` |
| `GET /api/teams/invitations?cursor=` | lời mời `pending` của người gọi, mới nhất trước, keyset `(updated_at, id)`: `{ team: { id, name }, invitedBy: user, invitedAt }` |
| `GET /api/friends/counts` (đổi) | thêm `teamInvitations` để số trên tab Invitations là `received + teamInvitations` |

**Realtime**: event mới `team-updated` trên `private-user-{publicId}` của người bị ảnh hưởng, payload `{ teamId, change, conversationId, userId }` với `change` ∈ `invited | joined | declined | left | kicked | renamed | host | ended` (`declined` chỉ gửi cho chủ team, `userId` là người từ chối); `conversationId` là id công khai của hội thoại team (nếu có; với `ended` đọc trước khi xóa team), `userId` là người bị ảnh hưởng (người được mời / vào / rời / bị đuổi / chủ mới; với `renamed` và `ended` là người thực hiện). Client invalidate các query team, counts, hộp thư và badge chưa đọc (không vá cache: thay đổi team hiếm, danh sách nhỏ); riêng `ended`, và `kicked` / `left` mà `userId` là chính mình, còn bỏ hội thoại team khỏi cache hộp thư ngay. Chat tự phát event chat của nó qua `syncTeamMember`.

**Thông báo**:

| Khi | Gửi cho | `kind` | `link` | `dedupeKey` |
|---|---|---|---|---|
| Được mời (tạo team hoặc mời thêm) | người được mời | `team_invite` | `/contact?tab=invitations` | `<teamId>:<updated_at của dòng mời lúc mời, ms>` (mời lại sau khi từ chối / rời / bị đuổi là lời mời mới, báo lại một lần) |
| Thành chủ do chủ cũ rời | chủ mới | `team_host` | `/messages/<conversationId>` | `<teamId>:<joined_at của chủ mới, ms>` |

Không thông báo khi từ chối, rời, bị đuổi, đổi tên.

## 7. Giao diện

- **`/messages`**: nút **New team** ở đầu cột hộp thư → dialog: ô tên (đếm 20 ký tự), danh sách bạn bè (từ `friendQueries.list`) có ô chọn, tối đa 4; nút **Create**. Tạo xong mở hội thoại team.
- **Hội thoại team**: menu ⋯ ở header thêm
  - **Members (n/5)**: dialog liệt kê thành viên (chủ có nhãn "Host"), người đang được mời ("Invited"); chủ thấy nút **Remove** từng người (AlertDialog xác nhận);
  - **Invite friends** (chủ): dialog chọn bạn, ẩn người đã trong team / đang được mời, chặn chọn quá chỗ còn lại;
  - **Rename team** (chủ);
  - **Leave team** (AlertDialog; với chủ, câu xác nhận nói ai sẽ thành chủ mới, hoặc "the team will end" nếu là người cuối).
- **`/contact` → Invitations**: thêm phần **Teams** (Accept / Decline) dưới phần lời mời kết bạn; tab đếm cả hai.
- Chuông: icon và cách hiển thị cho `team_invite`, `team_host`.
- Trạng thái rỗng / loading / lỗi và toast như bạn bè. Trước task UI đầu tiên: `ui-consistency:finding-patterns`.

## 7.1 Hiệu năng

- Danh sách thành viên ≤ 5 dòng: một query, không phân trang.
- Lời mời team: keyset `(updated_at, id)` trên `team_members` của người gọi — index mới `(user_id, status, updated_at DESC, id)` hoặc dùng `idx_team_members_user (user_id, status)` nếu `EXPLAIN` cho thấy đủ (số lời mời mỗi người nhỏ). Quyết định ghi ở plan sau `EXPLAIN`.
- Kiểm tra sức chứa (`approved + pending`) đếm trong transaction đã khóa team: không thể vượt 5 khi hai lệnh mời chạy song song.
- `team-updated` chỉ invalidate; mỗi thao tác phát tối đa 5 event (một team ≤ 5 người).

## 8. Lỗi

| Trường hợp | Trả | UI |
|---|---|---|
| Tên rỗng / > 20 ký tự / `memberIds` rỗng hoặc > 4 / id sai dạng | 400 | lỗi dưới ô hoặc toast |
| Người được mời không tồn tại / không active | 404 | toast |
| Không phải bạn, có chặn | 403 "Can't invite this person" | toast |
| Không phải chủ khi mời / đuổi / đổi tên; không phải thành viên khi xem / rời | 403 / 404 | toast |
| Team đầy; lời mời không còn `pending` | 409 | toast, refetch |
| Vượt rate limit | 429 | toast |

## 9. Test

- `__tests__/teams/teams.integration.test.js` (DB thật): tạo team (chủ `approved`, mời `pending`, hội thoại team có chủ); mời người không phải bạn / có chặn / không active bị từ chối và không tạo gì; sức chứa 5 tính cả `pending`, hai lệnh mời song song không vượt; chấp nhận → `approved` + vào hội thoại; từ chối; đuổi (`approved` → mất quyền đọc hội thoại; `pending` → lời mời biến mất); đổi tên chỉ chủ; rời thường; chủ rời → người `joined_at` sớm nhất thành chủ; người cuối rời → team và hội thoại bị xóa; mời lại người đã rời / bị đuổi.
- Unit (mock `notify`, pusher, `runAfter` chạy ngay): đúng thông báo `team_invite` / `team_host` và `dedupeKey`; không thông báo khi từ chối / rời / đuổi / đổi tên; `team-updated` tới đúng người.
- UI: dialog New team (giới hạn 4, đếm ký tự), menu team theo vai trò (chủ / thành viên), Members / Remove / Leave có xác nhận, phần Teams trong Invitations.
- E2E tay hai tài khoản local: A tạo team mời B → B thấy chuông + Invitations → Accept → cả hai nhắn trong hội thoại team → A rời → B thành chủ, nhận `team_host`.

## 10. Việc ngoài code

- Chạy migration mới trên production trước khi deploy.
- Không có biến môi trường mới.

## 11. Để người làm tự quyết

- Tên file component, câu chữ cụ thể của dialog và toast (theo cách các dialog chat đang viết).
- Icon của hai loại thông báo mới.
