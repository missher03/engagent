# EngAgent

Ứng dụng học tiếng Anh cho người làm Data Science/AI ở mức B1-B2: đọc paper, họp kỹ thuật, thuyết trình, báo cáo, hỏi đáp, và luyện bảo vệ luận văn về AI trong đầu tư.

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
│   │   │   └── learn.py        sinh bài nghe/đọc, chấm viết, giám khảo hội đồng, hồ sơ
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
| Hội đồng | `/examiner` | Claude Sonnet đóng vai giám khảo, đọc câu hỏi thành tiếng |
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

### 3. Test

```bash
cd backend && pytest -q            # 8 test, chạy mock, không gọi API ngoài
cd frontend && npm run typecheck
```

## API key (điền vào `backend/.env`)

| Biến | Lấy ở đâu | Không có thì |
|---|---|---|
| `ANTHROPIC_API_KEY` | console.anthropic.com → API Keys | nghĩa từ, bài đọc, chấm viết/nói, giám khảo chạy mock |
| `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION` | Azure portal → tạo resource **Speech** (gói F0 miễn phí 5 giờ/tháng) | điểm phát âm giả lập; màn Nói cho bạn gõ bản ghi |
| `GOOGLE_TTS_API_KEY` | Google Cloud Console → bật **Text-to-Speech API** → Credentials → API key | dùng giọng đọc có sẵn của trình duyệt |
| `DATAMUSE_API_KEY` | datamuse.com (bắt buộc từ 01/02/2027) | vẫn chạy được tới hết 31/01/2027 |

Model mặc định theo PRD: `claude-haiku-5-5` cho việc hàng loạt (giải nghĩa, sinh bài, câu hỏi) và `claude-sonnet-5-5` cho chấm viết, chấm nói, giám khảo. Đổi bằng `LLM_MODEL_FAST` / `LLM_MODEL_SMART`.

Sau khi điền `ANTHROPIC_API_KEY`, gọi `POST /api/notebook/enrich-pending` (trong /docs) để tra lại nghĩa thật cho các từ đã thêm lúc còn mock.

## Những gì đã làm và chưa làm

Đã có:
- Kho 100 từ/cụm từ theo 12 chủ đề trong tài liệu thiết kế, gắn nhãn ưu tiên luận văn.
- Tra từ có cache: tra lần đầu lưu vào DB, lần sau không gọi API.
- SRS 4 mức (nhận biết → nhớ lại → dùng đúng → sản xuất); từ ưu tiên 1 chỉ "thuộc" khi qua mức 4 hai lần.
- Sinh bài theo 5 thể loại, B1/B2, tự chọn từ chủ đề + từ đến hạn ôn; kiểm tra đủ từ, độ dài, độ dài câu; cache bài theo (chủ đề, trình độ, thể loại, từ).
- Chấm phát âm đến từng từ/âm vị, chấm viết, chấm nói, mô phỏng hội đồng 5 câu có nhận xét.
- Lưu mọi lần làm bài (bảng `Attempt`) để theo dõi tiến bộ.

Gợi ý bước tiếp theo (theo thứ tự PRD):
1. Bộ từ: mở rộng `seed_words.json` (AWL đủ 570 họ từ, thuật ngữ ML ~600, tài chính ~400); thêm từ chủ đề 9 sát đề tài thật.
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
