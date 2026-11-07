# Web push cho thông báo inbox bằng Pusher Beams

Trạng thái 2026-11-07: thiết kế đã chốt, chưa implement. Đây là đợt 6 (phần web push) của `docs/notification-plan.md`.

## 1. Bối cảnh

Pusher có hai sản phẩm:

| Sản phẩm | Vai trò ở CodeDev | Trạng thái |
|---|---|---|
| **Channels** (WebSocket) | Báo cho **tab đang mở**: `notification-created`, `progress-updated`, `session-revoked`, kênh `broadcast`… | Đã làm: `lib/pusher.js`, `lib/realtime.js`, `lib/pusherClient.js`, `app/api/pusher/auth/route.js`, `components/realtime/userRealtimeBridge.jsx` |
| **Beams** (web push) | Báo khi **không có tab nào đang mở hoặc đang được focus** | Chưa dùng. Working tree đang gỡ `@pusher/push-notifications-web` |

Channels giữ nguyên. Beams được thêm làm kênh thứ hai cho cùng các dòng `profile.notification`.

## 2. Mục tiêu và phạm vi

- Mỗi dòng mới trong inbox được push qua Beams tới các thiết bị đã bật push của người đó. Áp dụng cho mọi kind, kể cả announcement.
- Không hiện push khi đang có một tab của site được focus. Lúc đó Channels đã cập nhật badge.
- Người dùng bật/tắt bằng công tắc "Browser notifications" trong Settings, **cho từng thiết bị**. App không tự hỏi quyền thông báo.
- Không thêm bảng DB. Beams giữ liên kết thiết bị–user (Authenticated Users).
- Không thêm dependency phía server. Gọi REST bằng `fetch`, ký token bằng `jose` (đã có).

Không làm: tùy chọn theo từng kind, nhắc học / streak, push cho người chưa đăng nhập, icon riêng cho từng kind, Safari (SDK web của Beams chỉ hỗ trợ Chrome, Firefox, Edge, Opera).

## 3. Cấu hình

Lấy từ tab **Keys** của instance Beams:

| Biến | Giá trị | Phía |
|---|---|---|
| `BEAMS_INSTANCE_ID` | Instance ID | server |
| `NEXT_PUBLIC_BEAMS_INSTANCE_ID` | Instance ID (cùng giá trị) | client |
| `BEAMS_SECRET_KEY` | **Primary key** | chỉ server |

- `BEAMS_SECRET_KEY` không bao giờ có prefix `NEXT_PUBLIC_` và không được commit. Ai có key này đều gửi được push tới mọi user và xoá được thiết bị của họ.
- Secondary key dùng khi xoay key, chưa cần.
- Thiếu biến thì cả hai phía đều no-op: server warn một lần (giống `getPusherServer`), Settings hiện trạng thái "không hỗ trợ" (mục 6.4).

## 4. Luồng

```
notify() / deliverBatch()
   └─ INSERT profile.notification (đã có)
        ├─ publishToUser()  Channels → tab đang mở (đã có)
        └─ pushToUsers()    Beams REST → thiết bị đã bật → service worker
                                         (hide_notification_if_site_has_focus: true)
```

## 5. Server

### 5.1 `lib/beams.js` (mới, chỉ chạy phía server)

Base URL: `https://{instanceId}.pushnotifications.pusher.com`. Header `Authorization: Bearer {BEAMS_SECRET_KEY}`.

| Hàm | Làm gì |
|---|---|
| `beamsToken(userId)` | JWT HS256 ký bằng secret key qua `jose`, claim `sub = userId`, `iss = https://{instanceId}.pushnotifications.pusher.com`, `iat`, `exp` = 24 giờ. Trả `{ token }`. Giống `generateToken` của SDK Node (`jwt.sign({}, secretKey, { expiresIn: '24h', issuer, subject })`) |
| `pushToUsers(userIds, { title, body, link })` | `POST /publish_api/v1/instances/{id}/publishes/users`. Mỗi request tối đa 1000 user, mảng dài hơn thì chia nhỏ. Body ở mục 5.2 |
| `deleteBeamsUser(userId)` | `DELETE /customer_api/v1/instances/{id}/users/{encodeURIComponent(userId)}`. Đây là đường tài liệu Customer API và e2e test của SDK web dùng (SDK Node gọi `/user_api`, bản cũ hơn) |

Quy tắc chung, cùng lý do với `publish` trong `lib/pusher.js`:
- Mọi hàm đều có await, `AbortSignal.timeout(3000)`, không bao giờ throw, trả `true`/`false`.
- Push chỉ là phần bổ sung. Dòng inbox đã ghi xong thì không được để push làm hỏng request.
- Trên serverless, việc chạy tiếp sau khi trả response có thể bị đóng băng, nên phải await.
- Bỏ user id rỗng hoặc dài quá 164 ký tự (giới hạn của Beams).

### 5.2 Payload

```json
{
  "users": ["<public id>", "..."],
  "web": {
    "time_to_live": 86400,
    "notification": {
      "title": "Course unlocked",
      "body": "You now have access to …",
      "deep_link": "https://<origin>/course/<id>",
      "hide_notification_if_site_has_focus": true
    }
  }
}
```

- `deep_link` = origin của `NEXTAUTH_URL` cộng `link`. `link` luôn là đường dẫn trong site (đã có CHECK của bảng và zod). `link` null thì dùng `/notifications`.
- `time_to_live` 1 ngày. Thông báo cũ hơn không còn đáng hiện, inbox vẫn giữ nó.
- Không gửi `data`. Payload chỉ có những gì đã hiện trong inbox.

### 5.3 Endpoint token: `app/api/pusher/beams-auth/route.js` (mới)

- `GET ?user_id=<public id>`. `TokenProvider` của SDK web gọi GET, gửi `user_id` trong query và gửi kèm cookie cùng origin.
- `user_id` khác `userId` của session thì trả 403.
- Hợp lệ thì trả `{ token }` dạng JSON, `Cache-Control: no-store`. Không bọc trong envelope `{ success, data }`, giống `app/api/pusher/auth`.
- Thiếu cấu hình thì trả 503.
- Dùng `apiRoute` với `limiter: rateLimiters.realtime`, `context: "api/pusher/beams-auth"`.

### 5.4 Chỗ gọi push

| Chỗ | Thay đổi |
|---|---|
| `services/notification.service.js` `notify` | Có dòng mới thì gọi `Promise.all([publishToUser(...), pushToUsers([userId], { title, body: message, link })])`. Đường này phủ `notifyCourse`, `notifyRewards` và mọi producer đang gọi `notify` |
| `db/announcement.db.js` `deliverBatch` | CTE `ins` join `identity.users` để trả `public_id`. Hàm trả thêm `userIds`, chỉ gồm người vừa được chèn dòng |
| Nơi chạy lô (`services/announcement.service.js` / `jobs/announcement.js`) | Gọi `pushToUsers(userIds, { title, body, link })` trong cùng `step.run` với lô. Lô chạy lại chèn được 0 dòng nên không push lại |
| `services/authOutbox.service.js` `"session.revoked"` | Khi `reason !== "logout"` thì `deleteBeamsUser(userId)` ở **mọi** lần thử (DELETE idempotent; lần 1 có thể đã dừng ở bước ghi cache). Thiết bị bị thu hồi phiên sẽ thôi nhận push. Các thiết bị còn hợp lệ tự đăng ký lại ở lần mở app tiếp theo (mục 6.2) |

## 6. Client

### 6.1 `public/service-worker.js` (mới)

```js
importScripts("https://js.pusher.com/beams/service-worker.js");
```

Không viết `onNotificationReceived`. Việc bỏ push khi site đang được focus đã do `hide_notification_if_site_has_focus` lo.

Đánh đổi: một tab đang hiện trên màn hình nhưng không được focus vẫn nhận push. Chấp nhận điều này để service worker chỉ có một dòng.

### 6.2 `lib/beamsClient.js` (mới)

Import động `@pusher/push-notifications-web`, chỉ khi cần, để bundle chung không nặng thêm.

| Hàm | Làm gì |
|---|---|
| `isWebPushSupported()` | Có `NEXT_PUBLIC_BEAMS_INSTANCE_ID`, `serviceWorker`, `PushManager`, `Notification` |
| `enableWebPush(userId)` | `Notification.requestPermission()`. Được `granted` thì `start()`, rồi `setUserId(userId, new TokenProvider({ url: "/api/pusher/beams-auth" }))`, rồi đặt flag `localStorage["webpush:" + userId] = "1"` |
| `disableWebPush(userId)` | `stop()` (xoá state ở local lẫn trên Beams), xoá flag |
| `resumeWebPush(userId)` | Chỉ chạy khi có flag và `Notification.permission === "granted"`. Nếu `getUserId()` là người khác thì `stop()` trước, rồi `start()` + `setUserId` (gọi lại vô hại) |
| `stopWebPush()` | `stop()` nếu SDK đã được nạp. Dùng khi sign out, giữ nguyên flag |

- Mọi thao tác với `localStorage` đều bọc try/catch.
- Flag gắn theo user. Người khác đăng nhập trên cùng trình duyệt không tự được bật push.
- Người cũ đăng nhập lại thì push tự bật lại.

### 6.3 Nối vào phần đã có

- `lib/authNavigation.js`: thêm `setWebPushStop(fn)` cùng kiểu với `setRealtimeDisconnect`, gọi ở cùng chỗ khi sign out. Nhờ vậy trang nào không dùng push cũng không phải tải SDK.
- `components/realtime/userRealtimeBridge.jsx`: một `useEffect` gọi `resumeWebPush(userId)` khi có `userId`.

### 6.4 Settings

Thêm mục "Browser notifications" vào `components/settings/settingsPage.jsx`. Vị trí và component do `ui-consistency:adjusting` quyết theo các mục Settings đang có.

| Trạng thái | Hiện gì |
|---|---|
| Không hỗ trợ / thiếu cấu hình | "Not supported on this browser.", công tắc bị khoá |
| `Notification.permission === "denied"` | "Blocked in your browser settings.", công tắc bị khoá |
| Bật | Công tắc bật: "This device gets a notification when CodeDev is not open." |
| Tắt | Công tắc tắt |
| Đang xử lý | Công tắc bị khoá, có spinner |

Lỗi hiện qua `showAlert`, như `preferencesSection.jsx`.

## 7. Bảo mật và rủi ro

- Token chỉ được cấp cho đúng user của session. Không dùng interest theo user, vì interest không có auth.
- Primary key chỉ nằm phía server (mục 3).
- Logout trên một thiết bị: client gọi `stop()`, `leaveSignedOut` chờ tối đa 1,5 giây trước khi rời trang; chưa xong thì trang chưa đăng nhập kế tiếp gỡ tiếp. Thiết bị bị thu hồi phiên từ xa: server gọi `deleteBeamsUser`.
- Beams trả 404 cho thiết bị nó đã xoá nhưng SDK vẫn giữ device id ở IndexedDB. `lib/beamsClient.js` coi 404 (và 401 "Subscription is not registered", khi đăng ký lại bằng push subscription cũ) là "đã gỡ": xoá state cục bộ, huỷ push subscription cũ rồi đăng ký lại. Đã thử trên Chrome với instance thật.
- Tắt push mà không gọi được Beams: công tắc vẫn bật và báo lỗi, không giấu một thiết bị còn gắn.
- Nội dung push chỉ là tiêu đề và một câu ngắn đã có trong inbox, không chứa lý do nội bộ (cùng quy tắc với mục 3.8 của notification-plan).
- Beams giới hạn 100 thiết bị mỗi user. Hạn mức của gói miễn phí thì xem trên dashboard trước khi bật production.

## 8. Test

- `lib/beams.js` (vitest, mock `fetch`):
  - chia lô 1000 user;
  - timeout hoặc lỗi HTTP trả `false`, không throw;
  - thiếu env thì không gọi `fetch`;
  - JWT verify được bằng secret, có `sub`, `iss` và `exp` khoảng 24 giờ;
  - `deep_link` là URL tuyệt đối.
- Route `beams-auth`: 403 khi `user_id` khác, 200 `{ token }` khi khớp, 503 khi thiếu cấu hình.
- `notify`:
  - có dòng mới thì push;
  - trùng `dedupe_key` (không có dòng) thì không push.
  - Test cũ trong `__tests__/notifications/` cần mock `@/lib/beams`.
- Announcement: lô có dòng chèn thì push đúng `userIds`, lô chạy lại thì không push.
- Outbox `session.revoked`: `reason = "logout"` thì không gọi `deleteBeamsUser`, lý do khác thì gọi một lần.

## 9. Kiểm tra thủ công (localhost, instance Beams thật)

1. Settings: bật công tắc, chấp nhận quyền. Beams debug console thấy thiết bị gắn với public id.
2. Chuyển sang app khác. Redeem một khoá học hoặc gửi announcement: thông báo hệ điều hành hiện ra, bấm vào mở đúng link.
3. Tab đang được focus: không có push, chỉ badge Channels.
4. Sign out: không còn push. Sign in lại: tự bật lại. Một user khác trên cùng trình duyệt: không tự bật.
5. Thu hồi phiên từ thiết bị khác: thiết bị bị thu hồi thôi nhận push. Kiểm tra luôn đường `deleteBeamsUser` (mục 5.1).
6. Mục Settings ở 1024 và 375 px, light và dark, axe.
