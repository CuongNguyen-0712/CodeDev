# Plan: Xếp hạng theo EXP, điểm và rank tổng quan

Trạng thái: plan, chưa triển khai (2026-10-19). Dựa trên hệ thống EXP/Level và điểm đã có:
[learning-rewards-redesign-plan.md](learning-rewards-redesign-plan.md), [experience-leveling-design.md](experience-leveling-design.md).

## 1. Mục tiêu

Ba loại rank, mỗi loại có **hạng (tier)** và **vị trí (#)** trên bảng xếp hạng:

| Rank | Đo cái gì | Nguồn |
|---|---|---|
| **Rank kinh nghiệm** | Đã học được bao nhiêu | Tổng EXP (`profile.info.exp`) |
| **Rank điểm thưởng** | Đã làm đúng bao nhiêu | Tổng điểm **đã kiếm được** trọn đời, không phải số dư |
| **Rank tổng quan** | Kết hợp tiến độ, độ đúng và chất lượng | EXP + điểm đã kiếm + hệ số độ chính xác (§3.3) |

## 2. Nguyên tắc

1. **Rank không bao giờ giảm vì tiêu điểm.** Rank điểm tính trên điểm đã kiếm (`entry_type = 'earned'`), không tính số dư `profile.info.points`.
2. **Điều chỉnh điểm của admin không tính vào rank.** Các giao dịch `adjusted` (đối soát, sửa sai) và `refunded` không cộng vào điểm xếp hạng. EXP adjustment thì có tính, vì EXP là thước đo học tập và adjustment EXP chỉ dùng để sửa sai.
3. **Không lưu vị trí (#) vào DB.** Vị trí thay đổi mỗi khi người khác tiến bộ, nên luôn tính khi đọc từ các cột điểm có index.
4. **Tái dùng cái đã có.** Rank kinh nghiệm dùng lại **6 nhóm Level** đã định nghĩa (Khởi đầu…Master), không đặt thêm ngưỡng mới.
5. **Người học tự quyết có xuất hiện trên bảng xếp hạng hay không** (§7).

## 3. Hạng của từng loại rank

### 3.1 Rank kinh nghiệm: theo nhóm Level

| Hạng | Level | EXP tối thiểu |
|---|---|---:|
| Khởi đầu | 1–3 | 0 |
| Nền tảng | 4–7 | 450 |
| Developer | 8–11 | 1.900 |
| Chuyên sâu | 12–15 | 4.900 |
| Expert | 16–17 | 9.800 |
| Master | 18–20 | 13.500 |

Thêm cột `rank_group` vào `profile.exp_level` (một chỗ khai báo), nên đổi nhóm chỉ là sửa dữ liệu.

### 3.2 Rank điểm thưởng: theo điểm đã kiếm

Ước tính: một ngày học điển hình ≈ 80 điểm (2 lesson 20 + 1 quiz 10 + 1 fix_bug 20 + 1 mini_coding 30). Một course như `nodejs-high-performance` cho ≈ 810 điểm nếu làm đúng hết.

| Hạng | Điểm đã kiếm tối thiểu | Tương đương |
|---|---:|---|
| Đồng | 0 | Mới bắt đầu |
| Bạc | 300 | ~4 ngày học |
| Vàng | 1.000 | ~1 course |
| Bạch kim | 3.000 | ~4 course |
| Kim cương | 7.500 | ~9 course |
| Huyền thoại | 15.000 | ~18 course |

Ngưỡng nằm trong bảng `profile.rank_tier` (§5), sửa được không cần deploy.

### 3.3 Rank tổng quan

Điểm tổng quan (`rank_score`) quyết định cả hạng lẫn vị trí:

```
rank_score = round( (exp + 0.5 × points_earned) × accuracy_factor )

accuracy_factor = 0.9 + 0.2 × first_try_rate     (từ 0.9 đến 1.1)
first_try_rate  = challenges_first_try / challenges_passed
                  (chỉ áp dụng khi challenges_passed ≥ 10; trước đó accuracy_factor = 1.0)
```

Lý do chọn công thức:
- **EXP và điểm gần như cùng chiều.** Cả hai đến từ cùng các hoạt động (lesson, challenge), nên cộng hai số này chỉ khác EXP một chút. Thứ thực sự khác là **chất lượng**: làm đúng ngay lần đầu hay phải thử nhiều lần. Vì vậy có thêm hệ số độ chính xác.
- **Hệ số bị chặn ±10%**, để không ai bị phạt nặng vì từng làm sai, và không ai vượt lên chỉ nhờ làm ít mà đúng.
- **Trọng số điểm 0.5**, vì điểm đã đi kèm EXP; nếu để 1.0 thì phần "làm đúng" bị đếm hai lần.
- Không đưa streak hay số ngày hoạt động vào v1, vì app chưa ghi nhận streak (§11).

| Hạng tổng quan | `rank_score` tối thiểu |
|---|---:|
| Tân binh | 0 |
| Học viên | 500 |
| Thực chiến | 1.500 |
| Tinh anh | 4.000 |
| Bậc thầy | 9.000 |
| Huyền thoại | 18.000 |

## 4. Bảng xếp hạng

- **Ba bảng:** Tổng quan, Kinh nghiệm, Điểm thưởng.
- **Hai khoảng thời gian:**
  - **Trọn đời:** đọc từ các cột cache trên `profile.info`.
  - **30 ngày gần nhất:** cộng giao dịch trong 30 ngày từ `profile.exp_transaction` / `profile.point_transaction` (đã có index `(user_id, created_at)`). Bảng tổng quan 30 ngày dùng cùng công thức, nhưng với EXP/điểm kiếm trong 30 ngày.
- Mỗi bảng: top 50, cùng vị trí và hạng của chính người xem (kể cả khi ngoài top 50).
- **Hòa điểm:** ai đạt điểm đó trước thì đứng trên (thời điểm giao dịch cuối cùng tạo ra điểm đó), rồi đến id.
- **Cache:** kết quả bảng xếp hạng được lưu 5 phút trong Redis (`lib/cache.js`). Vị trí của chính người xem luôn tính trực tiếp.
- **Ai không xuất hiện:** người đã tắt hiển thị (§7), tài khoản bị khóa, tài khoản admin/test.

## 5. Data model

Một migration, expand-only:

| Thay đổi | Chi tiết |
|---|---|
| `profile.info.points_earned` bigint NOT NULL DEFAULT 0 | Tổng điểm `earned` trọn đời. `post_points` cộng vào khi `action = 'credit' AND entry_type = 'earned'`. Backfill từ ledger. View `profile.points_earned_drift` để đối soát. |
| `profile.info.challenges_passed`, `challenges_first_try` int NOT NULL DEFAULT 0 | Cập nhật trong `awardChallengeRewards` khi challenge được đạt lần đầu (quiz: lượt 1; coding: bài nộp đạt là lần nộp đầu). Backfill từ lượt quiz và bài nộp coding cũ. |
| `profile.info.rank_score` bigint **GENERATED ALWAYS AS (...) STORED** | Công thức §3.3, chỉ dùng các cột trên cùng dòng, nên không cần job tính lại. Có index `(rank_score DESC, user_id)`. |
| `profile.info.show_on_leaderboard` boolean NOT NULL DEFAULT true | Tùy chọn hiển thị (§7). |
| `profile.exp_level.rank_group` varchar | Nhóm Level của §3.1. |
| `profile.rank_tier` (`kind` `points` / `overall`, `tier`, `title`, `min_score`) | Ngưỡng của §3.2 và §3.3. |
| Index `profile.info (exp DESC, user_id)`, `(points_earned DESC, user_id)` | Cho bảng xếp hạng và phép đếm vị trí. |
| Xóa cột `profile.info.rank` | Cột cũ không dùng, tránh nhầm với rank mới. Đây là bước đợt 4 của plan trước. |

**Vị trí của một người** = số người hiển thị có điểm cao hơn + 1. Đây là một phép đếm có index trên cột điểm tương ứng.

## 6. API

| Route | Nội dung |
|---|---|
| `GET /api/ranking?board=overall\|exp\|points&period=all\|30d` | Top 50 `{ position, user: { id, username, image }, score, tier }` và `me: { position, score, tier, nextTier, toNextTier }` |
| `GET /api/user/me` | Thêm khối `ranks: { overall, exp, points }`, mỗi khối có `{ tier, title, position, score }`. Vị trí là trọn đời. |
| Phần thưởng (`rewardView`, `submit_lesson`) | Thêm `rankUp: { board, tier }` khi một lần nhận thưởng đưa người học lên hạng mới, để client báo ngay. |
| Cài đặt người dùng | Thêm `showOnLeaderboard` vào route cập nhật cài đặt hiện có. |

## 7. Quyền riêng tư

- Bảng xếp hạng chỉ hiện username và ảnh đại diện; không hiện email hay tên thật.
- Có công tắc "Hiện tôi trên bảng xếp hạng" trong Settings, mặc định **bật**. Khi tắt, người học vẫn thấy vị trí của mình, chỉ là người khác không thấy.

## 8. UI/UX

| Nơi | Thay đổi |
|---|---|
| **Trang mới `/ranking`** (thêm vào sidebar) | Tab Tổng quan / Kinh nghiệm / Điểm thưởng; chọn Trọn đời / 30 ngày; top 50 dạng bảng (vị trí, người dùng, hạng, điểm); top 3 nổi bật; dòng của chính người xem luôn ghim cuối bảng nếu ngoài top. |
| Dashboard | Thẻ "Xếp hạng": hạng tổng quan, vị trí `#N`, khoảng cách tới hạng kế. |
| Profile | Mục "Xếp hạng" có 3 dòng (Tổng quan / Kinh nghiệm / Điểm thưởng), mỗi dòng có hạng, vị trí và thanh tiến độ tới hạng kế; giải thích ngắn công thức tổng quan. |
| Contact | Hiện huy hiệu hạng tổng quan cạnh Level. |
| Phản hồi | Toast "Lên hạng Vàng (điểm thưởng)!" khi `rankUp` có giá trị. Không mở thêm dialog, để dialog lên Level vẫn là khoảnh khắc chính. |
| Thành phần chung | `RankBadge` (màu theo hạng, dùng token sẵn có) và `RankProgress`, đặt cạnh `LevelBadge` trong `components/ui/level.jsx`. |

## 9. Rủi ro và chống gian lận

- **Đây là rủi ro lớn nhất:** bảng xếp hạng công khai làm tăng động cơ gian lận. Trên production (Vercel) chưa bật code runner (`CODE_RUNNER_URL`), nên kết quả coding vẫn do trình duyệt báo về và **giả được** → điểm và EXP coding giả được → rank giả được.
  - Đề xuất: **bật code runner ở production trước khi mở bảng xếp hạng công khai.**
  - Nếu chưa bật được: tạm chỉ hiện rank của bản thân (hạng và vị trí), ẩn trang `/ranking`.
- **Tài khoản phụ** cày điểm: theo dõi (không chặn tự động) những tài khoản nộp cùng `code_sha256`; không hiện tài khoản chưa xác minh email trên bảng xếp hạng.
- **Bùng nổ truy vấn:** với vài nghìn người dùng, tính trực tiếp vẫn nhanh nhờ index. Khi lớn hơn, đổi bảng 30 ngày sang materialized view làm mới mỗi 10 phút.

## 10. Thứ tự triển khai

| Đợt | Nội dung |
|---|---|
| 1 | Migration §5 (cột, generated column, bảng ngưỡng, backfill), cập nhật `post_points` và `awardChallengeRewards`; test: cache khớp ledger, `rank_score` đúng công thức tại các biên (9 và 10 challenge), tiêu điểm không đổi rank, adjustment điểm không tính. |
| 2 | API §6 + khối `ranks` trong `/api/user/me` + `rankUp`; UI dashboard / profile / contact. |
| 3 | Trang `/ranking`, cache Redis, công tắc hiển thị. Chỉ mở công khai khi đã xử lý §9. |

## 11. Quyết định cần bạn chốt

| Câu hỏi | Mặc định trong plan |
|---|---|
| Rank điểm tính trên điểm đã kiếm hay số dư? | Điểm đã kiếm (không giảm khi tiêu). |
| Công thức rank tổng quan | `(EXP + 0.5 × điểm đã kiếm) × hệ số độ chính xác 0.9–1.1`. Phương án khác: chỉ `EXP + điểm`. |
| Có thêm streak / số ngày hoạt động vào rank tổng quan? | Không ở v1 (chưa có dữ liệu streak). |
| Bảng 30 ngày | Có, bên cạnh trọn đời. Phương án khác: theo mùa (reset mỗi tháng). |
| Hiển thị trên bảng xếp hạng | Mặc định bật, có công tắc tắt. Phương án khác: mặc định tắt. |
| Tên các hạng | Như §3. Có thể đổi sang tiếng Anh (Bronze…Legend) cho đồng bộ với UI hiện tại. |
| Mở bảng xếp hạng công khai trước khi có code runner ở production? | Không; chỉ hiện rank cá nhân. |
