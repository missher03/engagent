# EngAgent

Ứng dụng học tiếng Anh cho người làm Data Science/AI ở mức B1-B2: đọc paper, họp kỹ thuật, thuyết trình, báo cáo và hỏi đáp. Nội dung mặc định là IT/AI/dữ liệu nói chung; dự án riêng trong Hồ sơ là tùy chọn.

Đây là **bộ khung chạy được end-to-end**. Mọi module đã có API + giao diện; thiếu API key nào thì module đó tự chạy ở **chế độ mock** (dữ liệu giả, có ghi `[mock]`) để bạn vẫn bấm thử toàn bộ luồng.

## Kiến trúc

```
engagent/
├── backend/            FastAPI (Python 3.11+) + SQLModel
│   ├── app/
│   │   ├── main.py             khởi tạo app, seed kho từ, phục vụ file audio
│   │   ├── config.py           đọc biến môi trường (.env)
│   │   ├── models.py           bảng: Word, Card, ReviewLog, Lesson, Attempt, Profile
│   │   ├── routers/
│   │   │   ├── vocab.py        tra từ, kho từ, sổ từ, ôn tập SRS, thống kê
│   │   │   ├── speech.py       chấm phát âm, TTS, chấm bài nói
│   │   │   └── learn.py        sinh bài nghe/đọc, chấm viết, giám khảo hỏi đáp kỹ thuật, hồ sơ
│   │   ├── services/
│   │   │   ├── llm.py          lớp bọc Claude (đổi model/nhà cung cấp ở đây)
│   │   │   ├── prompts.py      toàn bộ prompt + rubric (sửa prompt ở đây)
│   │   │   ├── dictionary.py   Free Dictionary API + Datamuse + nghĩa tiếng Việt bằng LLM
│   │   │   ├── srs.py          lịch ôn 1→3→7→16→35 ngày, 4 mức ghi nhớ, sinh câu hỏi ôn
│   │   │   ├── pronunciation.py Azure Pronunciation Assessment (REST)
│   │   │   ├── tts.py          Google Cloud TTS, cache MP3, 2 giọng cho hội thoại
│   │   │   └── content.py      sinh bài + kiểm tra chất lượng bằng code, sinh lại tối đa 2 lần
│   │   └── data/               seed_words.json (100 từ, 12 chủ đề), topics.json, writing_tasks.json
│   └── tests/                  pytest (chạy ở chế độ mock, không tốn tiền API)
└── frontend/           Next.js 15 (App Router, TypeScript), không dùng thư viện UI
    ├── app/                    mỗi thư mục là một màn hình
    ├── components/             Recorder (ghi âm → WAV 16 kHz), Scores
    └── lib/                    api.ts, wav.ts, dictation.ts (nhận dạng giọng nói của trình duyệt)
```

| Màn hình | Đường dẫn | Dịch vụ dùng |
|---|---|---|
| Tổng quan | `/` | thống kê SRS, điểm trung bình 5 lần gần nhất |
| Tra từ | `/dictionary` | Free Dictionary, Datamuse, Claude Haiku |
| Kho từ / sổ từ | `/words` | 4 bộ: awl, ml, finance, presentation |
| Ôn tập | `/review` | SRS, 4 dạng: nghĩa, điền từ, collocation, đặt câu |
| Phát âm | `/pronunciation` | Azure (tô màu từng từ theo điểm) |
| Bài nghe/đọc | `/lessons` | Claude Haiku sinh bài + câu hỏi, Google TTS |
| Viết | `/writing` | Claude Sonnet chấm theo rubric 4 tiêu chí |
| Nói | `/speaking` | Azure (nói tự do) + Claude Sonnet chấm |
| Hỏi đáp | `/examiner` | LLM đóng vai người hỏi sau bài thuyết trình kỹ thuật, đọc câu hỏi thành tiếng |
| Hồ sơ | `/profile` | đề tài, tóm tắt luận văn, ngày bảo vệ |

## Chạy trên máy

Cần Python 3.11+ và Node.js 20+.

### 1. Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env               # rồi điền key (có thể để trống để chạy mock)
uvicorn app.main:app --reload --port 8000
```

Mở http://localhost:8000/docs để xem và thử toàn bộ API (Swagger).
`http://localhost:8000/api/health` cho biết dịch vụ nào đang chạy thật (`on`) hay `mock`.

### 2. Frontend

```bash
cd frontend
npm install
cp .env.example .env.local         # NEXT_PUBLIC_API_URL=http://localhost:8000
npm run dev
```

Mở http://localhost:3000. Nên dùng Chrome hoặc Edge (ghi âm và nhận dạng giọng nói của trình duyệt hoạt động tốt nhất).

### Chạy nhanh trên Windows

- `start-app.bat`: bản dùng hằng ngày. Build frontend một lần rồi chạy bản production, chuyển trang gần như tức thì. Sửa code frontend xong thì chạy lại file này.
- `start-dev.bat`: bản phát triển, tự nạp lại khi sửa code. Lần đầu mở mỗi trang mất 2-4 giây vì Next.js phải biên dịch trang đó; từ lần thứ hai thì nhanh.

API mặc định gọi `http://127.0.0.1:8000` thay vì `localhost` (trên Windows, `localhost` có thể thử IPv6 trước làm mỗi request chậm thêm).

### 3. Test

```bash
cd backend && pytest -q            # 8 test, chạy mock, không gọi API ngoài
cd frontend && npm run typecheck
```

## API key (điền vào `backend/.env`)

| Biến | Lấy ở đâu | Không có thì |
|---|---|---|
| `ANTHROPIC_API_KEY` hoặc `MINIMAX_API_KEY` | console.anthropic.com, hoặc console MiniMax (xem mục dưới) | nghĩa từ, bài đọc, chấm viết/nói, giám khảo chạy mock |
| `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION` | Azure portal → tạo resource **Speech** (gói F0 miễn phí 5 giờ/tháng) | điểm phát âm giả lập; màn Nói cho bạn gõ bản ghi |
| `GOOGLE_TTS_API_KEY` | Google Cloud Console → bật **Text-to-Speech API** → Credentials → API key | dùng giọng đọc có sẵn của trình duyệt |
| `DATAMUSE_API_KEY` | datamuse.com (bắt buộc từ 01/02/2027) | vẫn chạy được tới hết 31/01/2027 |

### Dùng MiniMax thay cho Claude

App gọi MiniMax qua endpoint tương thích Anthropic (cùng SDK, chỉ đổi địa chỉ, key và tên model). Trong `backend/.env`:

```
LLM_PROVIDER=minimax
MINIMAX_API_KEY=<key của bạn>
MINIMAX_BASE_URL=https://api.minimax.cn/anthropic     # key bản Trung Quốc; bản quốc tế: https://api.minimax.io/anthropic
MINIMAX_MODEL_FAST=MiniMax-M3.1-Flash
MINIMAX_MODEL_SMART=MiniMax-M3.1-Flash                # hoặc MiniMax-M3
```

Khởi động lại uvicorn rồi mở `/api/health`: dòng `llm` phải là `minimax`. MiniMax luôn bật suy nghĩ (thinking) với M3.1-Flash và phần suy nghĩ tính vào `max_tokens`, nên app tự nới `max_tokens` khi dùng MiniMax. Đổi lại Claude chỉ cần `LLM_PROVIDER=anthropic`.

Model mặc định theo PRD: `claude-haiku-5-5` cho việc hàng loạt (giải nghĩa, sinh bài, câu hỏi) và `claude-sonnet-5-5` cho chấm viết, chấm nói, giám khảo. Đổi bằng `LLM_MODEL_FAST` / `LLM_MODEL_SMART`.

Sau khi điền `ANTHROPIC_API_KEY`, gọi `POST /api/notebook/enrich-pending` (trong /docs) để tra lại nghĩa thật cho các từ đã thêm lúc còn mock.

## Kho 2000 từ vựng

Danh sách từ nằm trong `backend/app/data/vocab_taxonomy.txt`: 11 lĩnh vực (từ học thuật, AI, ML, DL, khoa học dữ liệu, data engineering, phần mềm, cloud/DevOps/MLOps, bảo mật/mạng, tài liệu và giao tiếp, tài chính - đầu tư), 42 chủ đề nhỏ, khoảng 2033 từ/cụm từ. Muốn thêm/bớt từ thì sửa file này (mỗi chủ đề một dòng `## khóa | Tên`, từ cách nhau bằng dấu phẩy) rồi khởi động lại backend.

Nội dung từng từ (nghĩa tiếng Việt, định nghĩa tiếng Anh, từ loại, IPA, trọng âm, cách dùng, collocation, ví dụ + bản dịch, CEFR) có 3 cách sinh:

1. **Sinh sẵn tất cả (khuyên dùng):** `python scripts/build_vocab.py` trong thư mục backend. Gọi LLM theo lô 12 từ, 4 lô song song, lưu dần vào `app/data/vocab_content.json`; bị ngắt thì chạy lại, nó làm tiếp phần còn thiếu. Thử trước: `python scripts/build_vocab.py --limit 30`. Xong thì khởi động lại uvicorn để nạp vào DB.
2. **Theo chủ đề:** nút "Sinh nội dung cho N từ còn thiếu" trong trang chủ đề.
3. **Theo từ:** mở trang chi tiết một từ chưa có nội dung, app tự sinh và lưu lại.

Trang chi tiết từ (`/word/<id>`) có: nghe (giọng trình duyệt, tốc độ thường/chậm), luyện phát âm từ hoặc câu ví dụ (Azure), đặt câu có LLM chấm, luyện nói (nhận dạng giọng nói của Chrome/Edge rồi LLM chấm), và nút sang từ tiếp theo trong chủ đề. Trang Bài nghe/đọc có thể chọn chủ đề nhỏ để sinh bài từ đúng nhóm từ đó.

## Những gì đã làm và chưa làm

Đã có:
- Kho 100 từ/cụm từ theo 12 chủ đề trong tài liệu thiết kế, gắn nhãn ưu tiên luận văn.
- Tra từ có cache: tra lần đầu lưu vào DB, lần sau không gọi API.
- SRS 4 mức (nhận biết → nhớ lại → dùng đúng → sản xuất); từ ưu tiên 1 chỉ "thuộc" khi qua mức 4 hai lần.
- Sinh bài theo 5 thể loại, B1/B2, tự chọn từ chủ đề + từ đến hạn ôn; kiểm tra đủ từ, độ dài, độ dài câu; cache bài theo (chủ đề, trình độ, thể loại, từ).
- Chấm phát âm đến từng từ/âm vị, chấm viết, chấm nói, mô phỏng hỏi đáp kỹ thuật 5 câu có nhận xét.
- Lưu mọi lần làm bài (bảng `Attempt`) để theo dõi tiến bộ.

Gợi ý bước tiếp theo (theo thứ tự PRD):
1. Bộ từ: mở rộng `seed_words.json` (AWL đủ 570 họ từ, thuật ngữ ML ~600, tài chính ~400); thêm từ theo nhu cầu.
2. SRS: thay hàm `schedule()` trong `services/srs.py` bằng FSRS (gói `fsrs`); chấm câu mức 4 bằng LLM thay vì chỉ kiểm tra có dùng từ.
3. Chế độ bảo vệ luận văn: nạp slide/tóm tắt (PDF), sinh kịch bản nói từng slide, luyện đọc từng slide có chấm.
4. Đăng nhập + nhiều người dùng: thêm bảng User, `user_id` vào các bảng; hoặc chuyển sang Supabase Auth.
5. PWA offline: service worker cache audio đã tải (hiện mới có `manifest.json`).
6. Job nền sinh playlist podcast ban đêm (Batch API giảm 50% chi phí).
7. Kiểm tra tỉ lệ từ lạ trong bài sinh (cần danh sách từ thông dụng) — đã để TODO trong `services/content.py`.

## Đổi sang Postgres / Supabase

Đặt `DATABASE_URL=postgresql+psycopg://user:pass@host:5432/db` và `pip install "psycopg[binary]"`. Bảng tự tạo khi khởi động. Khi schema bắt đầu thay đổi thường xuyên, nên thêm Alembic cho migration.

## Ghi chú về dữ liệu

File ghi âm không được lưu, chỉ lưu điểm. Thông tin luận văn trong Hồ sơ được gửi tới Claude khi sinh bài và đóng vai giám khảo. Dữ liệu từ Free Dictionary (Wiktionary) dùng giấy phép CC BY-SA; nếu mở app công khai cần ghi nguồn.
