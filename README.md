# keyboxhub-web

## Thông báo webhook và Telegram

Thông báo được gửi khi upload hoặc tự lấy key mới từ nguồn ngoài, khi key vừa
chuyển sang banned, và khi trạng thái Strong/Device/softban thay đổi hoặc phục hồi.
Key trùng bị bỏ qua và kiểm tra lại không có thay đổi sẽ không gửi thông báo.
Key mới đã banned chỉ gửi một sự kiện `keybox.added` với `status: "banned"`.
Key bị ban được loại khỏi danh sách trên web ở lần cập nhật tiếp theo (tự động
mỗi 30 giây). Metadata vẫn có trong API trong 24 giờ trước khi tự xóa.

Sao chép `.env.example` thành `.env` và điền các kênh cần dùng:

```dotenv
KEYBOX_WEBHOOK_URL=https://example.com/keybox-events
KEYBOX_WEBHOOK_TOKEN=your-webhook-token
TELEGRAM_BOT_TOKEN=your-bot-token
TELEGRAM_CHAT_ID=-1001234567890
```

- Webhook: POST JSON tới `KEYBOX_WEBHOOK_URL`. `KEYBOX_WEBHOOK_TOKEN` tùy chọn;
  nếu đặt, request có header `Authorization: Bearer <token>`.
- Telegram: tạo bot bằng @BotFather, đặt token và ID chat/nhóm/kênh nhận tin.
  Chat riêng cần nhắn `/start` cho bot trước; nhóm cần thêm bot và cho phép gửi
  tin; kênh cần cấp quyền đăng tin cho bot. Gửi qua
  [Telegram Bot API sendMessage](https://core.telegram.org/bots/api#sendmessage).
- Bỏ trống URL để tắt webhook; Telegram chỉ bật khi có cả token và chat ID.
  Có thể bật cả hai kênh cùng lúc.

Chạy với Node.js 22+:

```bash
node --env-file=.env src/server.js
```

Nếu dùng systemd, thêm `EnvironmentFile=/home/opc/keybox/.env` vào phần
`[Service]` bằng `sudo systemctl edit keybox.service`, sau đó chạy
`sudo systemctl daemon-reload` và `sudo systemctl restart keybox.service`.
`npm start` cũng hoạt động nếu các biến đã được truyền vào môi trường tiến trình.

Ví dụ payload webhook:

```json
{
  "event_id": "9722ab1d-5c1e-4b82-90a6-383dd22e1b82",
  "event": "keybox.banned",
  "occurred_at": "2026-10-07T10:00:00.000Z",
  "previous_status": "strong",
  "keybox": {
    "id": 42,
    "device_id": "example-device",
    "algorithm": "rsa",
    "status": "banned",
    "is_softbanned": false,
    "source": "user_upload",
    "uploaded_at": "2026-10-07T09:00:00.000Z",
    "banned_at": "2026-10-07T10:00:00.000Z"
  },
  "system_status": {
    "status": "strong",
    "strong_count": 3,
    "device_count": 1,
    "banned_count": 2,
    "softbanned_count": 0,
    "total_valid": 4,
    "total_keys": 6,
    "last_updated": "2026-10-07T10:00:00.000Z",
    "last_looted_at": null
  }
}
```

Các loại sự kiện: `keybox.added`, `keybox.banned`, `keybox.status_changed`.
Payload và tin Telegram chỉ chứa metadata, không chứa XML, private key hoặc IP
người upload. Mỗi kênh gửi độc lập trong nền, timeout 10 giây. Lỗi gửi được ghi
log và không làm hỏng upload/kiểm tra key. Không có hàng đợi lưu bền hoặc retry;
thông báo có thể mất khi dịch vụ nhận lỗi hoặc tiến trình dừng trong lúc gửi.

Chạy test thông báo độc lập, không dùng database đang hoạt động:

```bash
node --test test/notifications.test.js
```
