# Đưa EngAgent lên mạng

App có hai phần, deploy ở hai nơi:

| Phần | Nơi chạy | Vì sao |
|---|---|---|
| Giao diện (Next.js, thư mục `frontend`) | **Vercel** (miễn phí) | Vercel sinh ra cho Next.js |
| API (FastAPI, thư mục `backend`) | **Render** (miễn phí) | Vercel chỉ chạy hàm ngắn, không giữ được tiến trình Python lâu dài |
| Dữ liệu | **Neon** Postgres (miễn phí) | Ổ đĩa của Render bản miễn phí bị xóa mỗi lần khởi động lại, nên SQLite sẽ mất dữ liệu |

## 1. Tạo CSDL trên Neon
1. Vào https://neon.tech, tạo project (chọn vùng Singapore cho gần Việt Nam).
2. Chép chuỗi kết nối dạng `postgresql://...neon.tech/neondb?sslmode=require`.

## 2. (Tùy chọn) Chép dữ liệu đang học trên máy lên Neon
Trên máy Windows, trong thư mục `backend`:
```
.venv\Scripts\pip install "psycopg[binary]"
.venv\Scripts\python scripts\copy_sqlite_to_postgres.py sqlite:///./engagent.db "<chuỗi Neon>"
```
Chạy trước khi mở bản online lần đầu (Neon phải trống).

## 3. Deploy API lên Render
1. https://render.com > New > **Blueprint** > chọn repo `engagent`. Render đọc file `render.yaml`.
2. Điền các biến:
   - `DATABASE_URL`: chuỗi Neon
   - `MINIMAX_API_KEY`: key MiniMax (chỉ dán vào Render, không đưa vào code)
   - `SIGNUP_CODE`: một mã mời tự đặt
   - `CORS_ORIGINS`: để tạm `http://localhost:3000`, sửa lại ở bước 5
3. Đợi deploy xong, mở `https://<tên>.onrender.com/api/health` phải thấy `"ok": true`.

Bản miễn phí ngủ sau 15 phút không dùng; lần mở đầu tiên sau đó chờ khoảng 1 phút.

## 4. Deploy giao diện lên Vercel
1. https://vercel.com > Add New > Project > chọn repo `engagent`.
2. **Root Directory**: `frontend`.
3. Environment Variables: `NEXT_PUBLIC_API_URL` = địa chỉ Render ở bước 3.
4. Deploy, chép địa chỉ dạng `https://engagent-xxx.vercel.app`.

## 5. Nối hai bên
Trên Render, sửa `CORS_ORIGINS` thành địa chỉ Vercel (nhiều địa chỉ cách nhau bằng dấu phẩy), lưu để Render khởi động lại.

## Lưu ý
- Giọng đọc và nhận giọng nói dùng trình duyệt, cần HTTPS (Vercel đã có) và quyền micro.
- Muốn thêm người dùng: đưa họ mã mời `SIGNUP_CODE`.
- Bản trên máy (start-app.bat) vẫn chạy như cũ với SQLite.
