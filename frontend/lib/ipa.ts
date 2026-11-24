import { api, post } from "./api";
/** Dữ liệu luyện phát âm theo IPA (giọng Anh-Anh chuẩn, phiên âm kiểu từ điển Oxford/Cambridge). */

export type Sound = {
  ipa: string;            // ký hiệu, không có dấu /
  group: "short" | "long" | "diph" | "cons";
  voiced?: boolean;       // chỉ cho phụ âm
  how: string;            // cách đặt môi, lưỡi
  vn: string;             // gần giống âm nào trong tiếng Việt
  mistake: string;        // lỗi người Việt hay mắc
  ex: string[];           // "word|ipa"
};

export const GROUPS: { key: Sound["group"]; name: string; note: string }[] = [
  { key: "short", name: "Nguyên âm ngắn", note: "Phát âm nhanh, gọn, miệng thả lỏng." },
  { key: "long", name: "Nguyên âm dài", note: "Có dấu ː: kéo dài hơn khoảng gấp đôi." },
  { key: "diph", name: "Nguyên âm đôi", note: "Trượt từ âm đầu sang âm sau, âm đầu rõ hơn." },
  { key: "cons", name: "Phụ âm", note: "Chú ý cặp vô thanh / hữu thanh và âm cuối." },
];

export const SOUNDS: Sound[] = [
  // ---- nguyên âm ngắn
  { ipa: "ɪ", group: "short", how: "Môi hơi dẹt, lưỡi cao nhưng thả lỏng hơn /iː/, phát âm rất ngắn.", vn: "Gần \"i\" trong \"ích\" nhưng ngắn và lơi hơn.", mistake: "Đọc dài thành /iː/: \"ship\" nghe như \"sheep\".", ex: ["fix|fɪks", "bit|bɪt", "list|lɪst", "commit|kəˈmɪt", "index|ˈɪndeks", "big|bɪɡ"] },
  { ipa: "e", group: "short", how: "Miệng mở vừa, môi dẹt, lưỡi ở giữa.", vn: "Gần \"e\" trong \"em\" nhưng miệng hẹp hơn một chút.", mistake: "Lẫn với /æ/: \"bed\" và \"bad\" đọc giống nhau.", ex: ["test|test", "set|set", "edge|edʒ", "metric|ˈmetrɪk", "network|ˈnetwɜːk", "method|ˈmeθəd"] },
  { ipa: "æ", group: "short", how: "Mở miệng rộng, kéo khóe môi sang hai bên, lưỡi thấp và đẩy ra trước.", vn: "Nằm giữa \"e\" và \"a\", giống \"a\" đọc với miệng bành ra.", mistake: "Đọc thành \"e\" hoặc \"a\" thuần Việt: \"app\" nghe như \"ép\".", ex: ["app|æp", "stack|stæk", "cache|kæʃ", "map|mæp", "batch|bætʃ", "backend|ˈbækend"] },
  { ipa: "ʌ", group: "short", how: "Miệng mở vừa, môi thả lỏng, lưỡi ở giữa, phát âm ngắn.", vn: "Gần \"ă\" trong \"ăn\".", mistake: "Đọc thành \"a\" dài hoặc \"ô\": \"bug\" thành \"bâg\".", ex: ["bug|bʌɡ", "run|rʌn", "function|ˈfʌŋkʃən", "public|ˈpʌblɪk", "upload|ˌʌpˈləʊd", "cluster|ˈklʌstə"] },
  { ipa: "ɒ", group: "short", how: "Miệng mở tròn, lưỡi thấp và lùi về sau, ngắn.", vn: "Gần \"o\" trong \"học\".", mistake: "Đọc thành \"ô\" (/əʊ/): \"log\" nghe như \"lốc\" kéo dài.", ex: ["log|lɒɡ", "job|dʒɒb", "model|ˈmɒdl", "lock|lɒk", "doc|dɒk", "robot|ˈrəʊbɒt"] },
  { ipa: "ʊ", group: "short", how: "Môi tròn nhẹ, không chu ra, lưỡi cao phía sau, ngắn.", vn: "Gần \"u\" trong \"cúp\" nhưng ngắn và lơi.", mistake: "Kéo dài thành /uː/: \"pull\" nghe như \"pool\".", ex: ["push|pʊʃ", "pull|pʊl", "book|bʊk", "look|lʊk", "full|fʊl", "hook|hʊk"] },
  { ipa: "ə", group: "short", how: "Âm \"schwa\": miệng, môi, lưỡi đều thả lỏng; luôn ở âm tiết không nhấn.", vn: "Gần \"ơ\" rất nhẹ và ngắn.", mistake: "Đọc rõ từng nguyên âm theo mặt chữ: \"data\" thành \"đa-ta\".", ex: ["data|ˈdeɪtə", "about|əˈbaʊt", "system|ˈsɪstəm", "parameter|pəˈræmɪtə", "support|səˈpɔːt", "focus|ˈfəʊkəs"] },
  // ---- nguyên âm dài
  { ipa: "iː", group: "long", how: "Kéo căng môi như đang cười, lưỡi cao, kéo dài.", vn: "Gần \"i\" trong \"đi\" nhưng dài hơn.", mistake: "Đọc ngắn nên \"sheep\" thành \"ship\", \"feel\" thành \"fill\".", ex: ["key|kiː", "team|tiːm", "speed|spiːd", "feature|ˈfiːtʃə", "deep|diːp", "screen|skriːn"] },
  { ipa: "ɑː", group: "long", how: "Mở miệng rộng, lưỡi thấp và lùi sau, kéo dài.", vn: "Gần \"a\" trong \"ba\" kéo dài.", mistake: "Đọc ngắn hoặc thêm âm /r/ quá nặng (giọng Anh-Anh không đọc r).", ex: ["chart|tʃɑːt", "start|stɑːt", "part|pɑːt", "large|lɑːdʒ", "card|kɑːd", "argument|ˈɑːɡjumənt"] },
  { ipa: "ɔː", group: "long", how: "Môi tròn và chu nhẹ, lưỡi lùi sau, kéo dài.", vn: "Gần \"o\" trong \"to\" kéo dài.", mistake: "Đọc thành \"ô\": \"call\" nghe như \"côl\".", ex: ["call|kɔːl", "port|pɔːt", "sort|sɔːt", "store|stɔː", "audio|ˈɔːdiəʊ", "all|ɔːl"] },
  { ipa: "uː", group: "long", how: "Chu tròn môi về trước, lưỡi cao phía sau, kéo dài.", vn: "Gần \"u\" trong \"thu\" kéo dài.", mistake: "Đọc ngắn: \"pool\" thành \"pull\".", ex: ["tool|tuːl", "root|ruːt", "loop|luːp", "user|ˈjuːzə", "compute|kəmˈpjuːt", "route|ruːt"] },
  { ipa: "ɜː", group: "long", how: "Môi thả lỏng hơi dẹt, lưỡi ở giữa, kéo dài.", vn: "Gần \"ơ\" kéo dài.", mistake: "Đọc thành \"ơ\" + \"r\" nặng hoặc thành \"e\": \"work\" thành \"wóc\".", ex: ["server|ˈsɜːvə", "search|sɜːtʃ", "work|wɜːk", "first|fɜːst", "learn|lɜːn", "term|tɜːm"] },
  // ---- nguyên âm đôi
  { ipa: "eɪ", group: "diph", how: "Bắt đầu từ /e/ rồi trượt nhẹ lên /ɪ/.", vn: "Gần \"ây\" trong \"đây\".", mistake: "Đọc thành \"e\" đơn: \"data\" thành \"đe-ta\".", ex: ["data|ˈdeɪtə", "table|ˈteɪbl", "save|seɪv", "page|peɪdʒ", "layer|ˈleɪə", "update|ˌʌpˈdeɪt"] },
  { ipa: "aɪ", group: "diph", how: "Bắt đầu với miệng mở rộng /a/ rồi trượt lên /ɪ/.", vn: "Gần \"ai\" trong \"hai\".", mistake: "Thiếu phần trượt hoặc nuốt âm cuối: \"file\" thành \"phai\".", ex: ["file|faɪl", "type|taɪp", "time|taɪm", "byte|baɪt", "pipeline|ˈpaɪplaɪn", "AI|ˌeɪˈaɪ"] },
  { ipa: "ɔɪ", group: "diph", how: "Bắt đầu từ /ɔː/ môi tròn rồi trượt sang /ɪ/.", vn: "Gần \"oi\" trong \"đói\".", mistake: "Thường đọc khá tốt; chú ý âm cuối: \"point\" thành \"poi\".", ex: ["deploy|dɪˈplɔɪ", "point|pɔɪnt", "choice|tʃɔɪs", "noise|nɔɪz", "join|dʒɔɪn", "avoid|əˈvɔɪd"] },
  { ipa: "aʊ", group: "diph", how: "Bắt đầu với miệng mở /a/ rồi khép tròn môi về /ʊ/.", vn: "Gần \"ao\" trong \"sao\".", mistake: "Bỏ âm cuối /d/, /t/: \"cloud\" thành \"clao\".", ex: ["cloud|klaʊd", "output|ˈaʊtpʊt", "count|kaʊnt", "download|ˌdaʊnˈləʊd", "how|haʊ", "now|naʊ"] },
  { ipa: "əʊ", group: "diph", how: "Bắt đầu từ /ə/ rồi tròn môi về /ʊ/.", vn: "Gần \"âu\" trong \"đâu\" (giọng Anh-Anh), không phải \"ô\".", mistake: "Đọc thành \"ô\" đơn: \"code\" thành \"cốt\".", ex: ["code|kəʊd", "node|nəʊd", "load|ləʊd", "token|ˈtəʊkən", "mode|məʊd", "go|ɡəʊ"] },
  { ipa: "ɪə", group: "diph", how: "Bắt đầu từ /ɪ/ rồi trượt về /ə/.", vn: "Gần \"ia\" trong \"kia\".", mistake: "Đọc thành \"i-a\" hai âm tiết tách rời.", ex: ["clear|klɪə", "query|ˈkwɪəri", "near|nɪə", "idea|aɪˈdɪə", "period|ˈpɪəriəd", "experience|ɪkˈspɪəriəns"] },
  { ipa: "eə", group: "diph", how: "Bắt đầu từ /e/ rồi trượt về /ə/.", vn: "Gần \"e-ơ\" đọc liền.", mistake: "Đọc thành \"e\" + \"r\" nặng: \"share\" thành \"sherr\".", ex: ["share|ʃeə", "hardware|ˈhɑːdweə", "software|ˈsɒftweə", "compare|kəmˈpeə", "aware|əˈweə", "where|weə"] },
  { ipa: "ʊə", group: "diph", how: "Bắt đầu từ /ʊ/ rồi trượt về /ə/.", vn: "Gần \"ua\" trong \"của\".", mistake: "Đọc thành \"ua\" quá mạnh; nhiều người bản xứ dùng /ɔː/ thay thế.", ex: ["secure|sɪˈkjʊə", "pure|pjʊə", "tour|tʊə", "during|ˈdjʊərɪŋ", "Europe|ˈjʊərəp", "plural|ˈplʊərəl"] },
  // ---- phụ âm
  { ipa: "p", group: "cons", voiced: false, how: "Mím hai môi rồi bật hơi mạnh ra (đặt tờ giấy trước miệng sẽ thấy rung).", vn: "Gần \"p\" nhưng bật hơi mạnh hơn.", mistake: "Không bật hơi nên nghe như /b/; nuốt /p/ ở cuối từ.", ex: ["push|pʊʃ", "input|ˈɪnpʊt", "map|mæp", "step|step", "group|ɡruːp", "API|ˌeɪpiːˈaɪ"] },
  { ipa: "b", group: "cons", voiced: true, how: "Mím hai môi rồi bật ra, dây thanh rung, không bật hơi mạnh.", vn: "Giống \"b\" trong \"ba\".", mistake: "Bỏ /b/ ở cuối từ: \"web\" thành \"we\".", ex: ["bug|bʌɡ", "build|bɪld", "debug|diːˈbʌɡ", "web|web", "job|dʒɒb", "label|ˈleɪbl"] },
  { ipa: "t", group: "cons", voiced: false, how: "Đầu lưỡi chạm lợi trên (sau răng cửa), bật hơi.", vn: "Gần \"th\" trong \"thì\" ở đầu từ (có bật hơi), không phải \"t\" Việt.", mistake: "Nuốt /t/ ở cuối từ: \"test\" thành \"tes\", \"output\" thành \"aopút\".", ex: ["test|test", "text|tekst", "start|stɑːt", "output|ˈaʊtpʊt", "commit|kəˈmɪt", "bit|bɪt"] },
  { ipa: "d", group: "cons", voiced: true, how: "Đầu lưỡi chạm lợi trên, dây thanh rung.", vn: "Gần \"đ\" nhưng đầu lưỡi đặt cao hơn ở lợi.", mistake: "Đọc cuối từ thành /t/ hoặc bỏ: \"code\" thành \"cốt\", \"cloud\" thành \"clao\".", ex: ["data|ˈdeɪtə", "deploy|dɪˈplɔɪ", "code|kəʊd", "cloud|klaʊd", "add|æd", "node|nəʊd"] },
  { ipa: "k", group: "cons", voiced: false, how: "Cuống lưỡi chạm ngạc mềm, bật hơi.", vn: "Gần \"kh\" nhẹ ở đầu từ (có bật hơi).", mistake: "Nuốt /k/ cuối: \"stack\" thành \"sta\".", ex: ["key|kiː", "cache|kæʃ", "click|klɪk", "track|træk", "stack|stæk", "lock|lɒk"] },
  { ipa: "ɡ", group: "cons", voiced: true, how: "Cuống lưỡi chạm ngạc mềm, dây thanh rung.", vn: "Giống \"g\" trong \"ga\".", mistake: "Đọc /ɡ/ cuối thành /k/: \"log\" thành \"lock\", \"bug\" thành \"buck\".", ex: ["go|ɡəʊ", "bug|bʌɡ", "log|lɒɡ", "tag|tæɡ", "big|bɪɡ", "graph|ɡrɑːf"] },
  { ipa: "f", group: "cons", voiced: false, how: "Răng trên chạm nhẹ môi dưới, thổi hơi.", vn: "Giống \"ph\" trong \"phim\".", mistake: "Bỏ /f/ ở cuối từ: \"graph\" thành \"gráp\".", ex: ["file|faɪl", "fix|fɪks", "feature|ˈfiːtʃə", "graph|ɡrɑːf", "profile|ˈprəʊfaɪl", "buffer|ˈbʌfə"] },
  { ipa: "v", group: "cons", voiced: true, how: "Răng trên chạm môi dưới, dây thanh rung.", vn: "Giống \"v\" trong \"về\".", mistake: "Bỏ /v/ ở cuối từ (\"save\" thành \"sây\") hoặc lẫn với /w/.", ex: ["server|ˈsɜːvə", "save|seɪv", "version|ˈvɜːʃən", "vector|ˈvektə", "level|ˈlevl", "move|muːv"] },
  { ipa: "θ", group: "cons", voiced: false, how: "Đặt đầu lưỡi giữa hai hàm răng, thổi hơi ra (không rung).", vn: "Không có trong tiếng Việt.", mistake: "Đọc thành \"th\" Việt hoặc /t/, /s/: \"think\" thành \"tink\" hay \"sink\".", ex: ["thread|θred", "think|θɪŋk", "method|ˈmeθəd", "path|pɑːθ", "math|mæθ", "throughput|ˈθruːpʊt"] },
  { ipa: "ð", group: "cons", voiced: true, how: "Đầu lưỡi giữa hai hàm răng như /θ/ nhưng dây thanh rung.", vn: "Không có trong tiếng Việt; gần \"đ\" đọc với lưỡi giữa răng.", mistake: "Đọc thành \"đ\" hoặc \"d\": \"the\" thành \"đờ\".", ex: ["the|ðə", "that|ðæt", "then|ðen", "other|ˈʌðə", "with|wɪð", "algorithm|ˈælɡərɪðəm"] },
  { ipa: "s", group: "cons", voiced: false, how: "Đầu lưỡi gần lợi trên, hơi đi qua khe hẹp tạo tiếng xì.", vn: "Giống \"x\" trong \"xa\".", mistake: "Bỏ /s/ cuối (số nhiều, ngôi thứ ba): \"tests\" thành \"tét\".", ex: ["search|sɜːtʃ", "system|ˈsɪstəm", "set|set", "class|klɑːs", "process|ˈprəʊses", "loss|lɒs"] },
  { ipa: "z", group: "cons", voiced: true, how: "Giống /s/ nhưng dây thanh rung (tiếng \"vo ve\").", vn: "Gần \"d\" giọng Bắc trong \"da\" nhưng rít hơn.", mistake: "Đọc /z/ cuối thành /s/ hoặc bỏ: \"files\" thành \"phai\".", ex: ["user|ˈjuːzə", "size|saɪz", "zero|ˈzɪərəʊ", "noise|nɔɪz", "files|faɪlz", "visualize|ˈvɪʒuəlaɪz"] },
  { ipa: "ʃ", group: "cons", voiced: false, how: "Chu môi ra trước, lưỡi lùi sau một chút, thổi hơi (\"suỵt\").", vn: "Gần \"s\" giọng Nam trong \"sữa\", môi chu hơn.", mistake: "Đọc thành /s/: \"session\" thành \"xét-xần\".", ex: ["push|pʊʃ", "share|ʃeə", "cache|kæʃ", "session|ˈseʃən", "function|ˈfʌŋkʃən", "dashboard|ˈdæʃbɔːd"] },
  { ipa: "ʒ", group: "cons", voiced: true, how: "Giống /ʃ/ nhưng dây thanh rung.", vn: "Gần \"gi\" giọng Bắc đọc rít, môi chu.", mistake: "Đọc thành /z/ hoặc /dʒ/: \"decision\" thành \"đi-xi-dần\".", ex: ["decision|dɪˈsɪʒən", "usual|ˈjuːʒuəl", "measure|ˈmeʒə", "precision|prɪˈsɪʒən", "revision|rɪˈvɪʒən", "visual|ˈvɪʒuəl"] },
  { ipa: "h", group: "cons", voiced: false, how: "Thở hơi nhẹ từ cổ họng, miệng mở.", vn: "Giống \"h\" trong \"hai\".", mistake: "Thường đọc tốt; đừng thêm /h/ vào từ bắt đầu bằng nguyên âm.", ex: ["hash|hæʃ", "host|həʊst", "hardware|ˈhɑːdweə", "how|haʊ", "hidden|ˈhɪdn", "behaviour|bɪˈheɪvjə"] },
  { ipa: "tʃ", group: "cons", voiced: false, how: "Bắt đầu như /t/ rồi bật thành /ʃ/, môi chu.", vn: "Gần \"ch\" nhưng bật hơi và chu môi hơn.", mistake: "Bỏ ở cuối từ: \"batch\" thành \"bét\", \"search\" thành \"sơ\".", ex: ["chart|tʃɑːt", "check|tʃek", "batch|bætʃ", "search|sɜːtʃ", "feature|ˈfiːtʃə", "architecture|ˈɑːkɪtektʃə"] },
  { ipa: "dʒ", group: "cons", voiced: true, how: "Giống /tʃ/ nhưng dây thanh rung.", vn: "Gần \"gi\" trong \"gì\" (giọng Bắc) nhưng bật mạnh hơn.", mistake: "Đọc thành /z/ hoặc bỏ ở cuối: \"page\" thành \"pây\".", ex: ["job|dʒɒb", "JSON|ˈdʒeɪsən", "page|peɪdʒ", "edge|edʒ", "large|lɑːdʒ", "manager|ˈmænɪdʒə"] },
  { ipa: "m", group: "cons", voiced: true, how: "Mím môi, hơi đi qua mũi.", vn: "Giống \"m\".", mistake: "Thường đọc tốt.", ex: ["model|ˈmɒdl", "map|mæp", "memory|ˈmeməri", "time|taɪm", "system|ˈsɪstəm", "metric|ˈmetrɪk"] },
  { ipa: "n", group: "cons", voiced: true, how: "Đầu lưỡi chạm lợi trên, hơi đi qua mũi.", vn: "Giống \"n\".", mistake: "Lẫn với /l/ (nhất là giọng một số vùng): \"node\" và \"load\".", ex: ["node|nəʊd", "network|ˈnetwɜːk", "token|ˈtəʊkən", "run|rʌn", "join|dʒɔɪn", "neural|ˈnjʊərəl"] },
  { ipa: "ŋ", group: "cons", voiced: true, how: "Cuống lưỡi chạm ngạc mềm, hơi đi qua mũi; không bật /ɡ/ ở cuối.", vn: "Giống \"ng\" trong \"sang\".", mistake: "Thêm /ɡ/ hoặc /k/ sau: \"training\" thành \"trây-ninh-gờ\".", ex: ["string|strɪŋ", "training|ˈtreɪnɪŋ", "think|θɪŋk", "ping|pɪŋ", "ranking|ˈræŋkɪŋ", "thing|θɪŋ"] },
  { ipa: "l", group: "cons", voiced: true, how: "Đầu lưỡi chạm lợi trên, hơi đi hai bên lưỡi; /l/ cuối từ lưỡi nâng sau (\"l tối\").", vn: "Giống \"l\" ở đầu từ; cuối từ gần \"âu\".", mistake: "Bỏ /l/ cuối: \"pull\" thành \"pu\", \"file\" thành \"phai\"; lẫn /l/ với /n/.", ex: ["log|lɒɡ", "load|ləʊd", "loop|luːp", "list|lɪst", "label|ˈleɪbl", "pull|pʊl"] },
  { ipa: "r", group: "cons", voiced: true, how: "Cong đầu lưỡi lên nhưng không chạm vòm miệng, môi hơi tròn.", vn: "Không giống \"r\" rung của tiếng Việt; gần \"r\" giọng Nam nhẹ.", mistake: "Rung lưỡi như tiếng Việt hoặc đọc thành /z/, /l/.", ex: ["run|rʌn", "root|ruːt", "read|riːd", "array|əˈreɪ", "random|ˈrændəm", "query|ˈkwɪəri"] },
  { ipa: "j", group: "cons", voiced: true, how: "Lưỡi nâng cao như /iː/ rồi trượt nhanh sang nguyên âm sau.", vn: "Giống \"d\" giọng Nam / \"gi\" trong \"giờ\" giọng Nam.", mistake: "Bỏ /j/: \"user\" thành \"u-dơ\", \"compute\" thành \"com-put\".", ex: ["user|ˈjuːzə", "yes|jes", "compute|kəmˈpjuːt", "value|ˈvæljuː", "few|fjuː", "yield|jiːld"] },
  { ipa: "w", group: "cons", voiced: true, how: "Chu tròn môi như /uː/ rồi mở nhanh sang nguyên âm sau; răng không chạm môi.", vn: "Gần \"qu\" trong \"qua\" bỏ phần \"k\".", mistake: "Đọc thành /v/: \"web\" thành \"véb\".", ex: ["web|web", "work|wɜːk", "where|weə", "network|ˈnetwɜːk", "query|ˈkwɪəri", "switch|swɪtʃ"] },
];

/** Cặp âm dễ nhầm với người Việt. "a"/"b" là âm IPA (khớp SOUNDS) để ghi tiến độ. */
export type PairGroup = { key: string; title: string; a: string; b: string; tip: string; pairs: [string, string][] };

export const PAIRS: PairGroup[] = [
  { key: "i", title: "/iː/ dài và /ɪ/ ngắn", a: "iː", b: "ɪ", tip: "/iː/ kéo căng môi và kéo dài; /ɪ/ ngắn, lơi.", pairs: [["sheep", "ship"], ["seat", "sit"], ["leave", "live"], ["feel", "fill"], ["heat", "hit"], ["peak", "pick"]] },
  { key: "ae", title: "/æ/ và /e/", a: "æ", b: "e", tip: "/æ/ mở miệng rộng hơn và bành môi sang hai bên.", pairs: [["bad", "bed"], ["man", "men"], ["sat", "set"], ["pan", "pen"], ["had", "head"], ["track", "trek"]] },
  { key: "u", title: "/uː/ dài và /ʊ/ ngắn", a: "uː", b: "ʊ", tip: "/uː/ chu môi, kéo dài; /ʊ/ ngắn, môi lơi.", pairs: [["pool", "pull"], ["fool", "full"], ["Luke", "look"], ["suit", "soot"], ["stewed", "stood"]] },
  { key: "o", title: "/ɒ/ và /əʊ/", a: "ɒ", b: "əʊ", tip: "/ɒ/ là \"o\" ngắn; /əʊ/ trượt từ \"ơ\" sang \"u\".", pairs: [["not", "note"], ["cost", "coast"], ["got", "goat"], ["rod", "road"], ["want", "won't"], ["cot", "coat"]] },
  { key: "th-t", title: "/θ/ và /t/", a: "θ", b: "t", tip: "/θ/ đặt lưỡi giữa hai răng và thổi hơi.", pairs: [["thank", "tank"], ["three", "tree"], ["thin", "tin"], ["math", "mat"], ["thought", "taught"], ["both", "boat"]] },
  { key: "th-s", title: "/θ/ và /s/", a: "θ", b: "s", tip: "/s/ lưỡi ở sau răng; /θ/ lưỡi thò ra giữa răng.", pairs: [["think", "sink"], ["thick", "sick"], ["mouth", "mouse"], ["path", "pass"], ["thing", "sing"], ["faith", "face"]] },
  { key: "dh-d", title: "/ð/ và /d/", a: "ð", b: "d", tip: "/ð/ lưỡi giữa răng, dây thanh rung.", pairs: [["they", "day"], ["then", "den"], ["those", "doze"], ["though", "dough"], ["breathe", "breed"], ["there", "dare"]] },
  { key: "sh-s", title: "/ʃ/ và /s/", a: "ʃ", b: "s", tip: "/ʃ/ chu môi, lưỡi lùi sau (\"suỵt\").", pairs: [["ship", "sip"], ["she", "see"], ["shell", "sell"], ["short", "sort"], ["shine", "sign"], ["mesh", "mess"]] },
  { key: "ch-sh", title: "/tʃ/ và /ʃ/", a: "tʃ", b: "ʃ", tip: "/tʃ/ bắt đầu bằng /t/ chặn hơi rồi mới bật ra.", pairs: [["chip", "ship"], ["chair", "share"], ["catch", "cash"], ["watch", "wash"], ["match", "mash"], ["cheap", "sheep"]] },
  { key: "v-w", title: "/v/ và /w/", a: "v", b: "w", tip: "/v/ răng chạm môi dưới; /w/ chu tròn môi, răng không chạm.", pairs: [["vest", "west"], ["vet", "wet"], ["vine", "wine"], ["verse", "worse"], ["vary", "wary"], ["veil", "whale"]] },
  { key: "l-n", title: "/l/ và /n/", a: "l", b: "n", tip: "/n/ hơi đi qua mũi (bịt mũi sẽ không nói được); /l/ hơi đi qua miệng.", pairs: [["light", "night"], ["low", "no"], ["lock", "knock"], ["line", "nine"], ["lead", "need"], ["load", "node"]] },
  { key: "r-l", title: "/r/ và /l/", a: "r", b: "l", tip: "/r/ cong lưỡi không chạm; /l/ đầu lưỡi chạm lợi trên.", pairs: [["right", "light"], ["read", "lead"], ["rock", "lock"], ["road", "load"], ["row", "low"], ["fry", "fly"]] },
  { key: "g-k", title: "/ɡ/ và /k/ ở cuối từ", a: "ɡ", b: "k", tip: "Nguyên âm trước /ɡ/ kéo dài hơn trước /k/.", pairs: [["log", "lock"], ["bug", "buck"], ["tag", "tack"], ["bag", "back"], ["pig", "pick"], ["dog", "dock"]] },
  { key: "z-s", title: "/z/ và /s/ ở cuối từ", a: "z", b: "s", tip: "Nguyên âm trước /z/ dài hơn; /z/ có tiếng rung.", pairs: [["prize", "price"], ["rise", "rice"], ["raise", "race"], ["plays", "place"], ["buzz", "bus"], ["laws", "loss"]] },
  { key: "final-td", title: "Âm cuối /t/, /d/ (đừng nuốt âm)", a: "t", b: "t", tip: "Người Việt hay bỏ âm cuối. Hãy chạm lưỡi vào lợi trên ở cuối từ.", pairs: [["tight", "tie"], ["road", "row"], ["seat", "sea"], ["float", "flow"], ["weight", "way"], ["bite", "buy"]] },
  { key: "final-s", title: "Âm cuối /s/, /z/ của số nhiều", a: "s", b: "s", tip: "Đọc rõ đuôi số nhiều: /s/ sau âm vô thanh, /z/ sau âm hữu thanh.", pairs: [["tests", "test"], ["files", "file"], ["bugs", "bug"], ["logs", "log"], ["nodes", "node"], ["users", "user"]] },
];

/** Bài trọng âm: âm tiết và vị trí nhấn (đếm từ 0). */
export const STRESS: { word: string; syl: string[]; s: number }[] = [
  { word: "analyze", syl: ["a", "na", "lyze"], s: 0 },
  { word: "analysis", syl: ["a", "nal", "y", "sis"], s: 1 },
  { word: "analytics", syl: ["an", "a", "lyt", "ics"], s: 2 },
  { word: "develop", syl: ["de", "vel", "op"], s: 1 },
  { word: "developer", syl: ["de", "vel", "op", "er"], s: 1 },
  { word: "algorithm", syl: ["al", "go", "rithm"], s: 0 },
  { word: "algorithmic", syl: ["al", "go", "rith", "mic"], s: 2 },
  { word: "architecture", syl: ["ar", "chi", "tec", "ture"], s: 0 },
  { word: "component", syl: ["com", "po", "nent"], s: 1 },
  { word: "database", syl: ["da", "ta", "base"], s: 0 },
  { word: "parameter", syl: ["pa", "ram", "e", "ter"], s: 1 },
  { word: "optimize", syl: ["op", "ti", "mize"], s: 0 },
  { word: "optimization", syl: ["op", "ti", "mi", "za", "tion"], s: 3 },
  { word: "infrastructure", syl: ["in", "fra", "struc", "ture"], s: 0 },
  { word: "evaluate", syl: ["e", "val", "u", "ate"], s: 1 },
  { word: "evaluation", syl: ["e", "val", "u", "a", "tion"], s: 3 },
  { word: "technology", syl: ["tech", "nol", "o", "gy"], s: 1 },
  { word: "technical", syl: ["tech", "ni", "cal"], s: 0 },
  { word: "statistics", syl: ["sta", "tis", "tics"], s: 1 },
  { word: "statistical", syl: ["sta", "tis", "ti", "cal"], s: 1 },
  { word: "deploy", syl: ["de", "ploy"], s: 1 },
  { word: "interface", syl: ["in", "ter", "face"], s: 0 },
  { word: "prototype", syl: ["pro", "to", "type"], s: 0 },
  { word: "variable", syl: ["var", "i", "a", "ble"], s: 0 },
  { word: "accuracy", syl: ["ac", "cu", "ra", "cy"], s: 0 },
  { word: "efficient", syl: ["ef", "fi", "cient"], s: 1 },
  { word: "percentage", syl: ["per", "cen", "tage"], s: 1 },
  { word: "hypothesis", syl: ["hy", "poth", "e", "sis"], s: 1 },
  { word: "academic", syl: ["ac", "a", "dem", "ic"], s: 2 },
  { word: "economic", syl: ["e", "co", "nom", "ic"], s: 2 },
  { word: "economy", syl: ["e", "con", "o", "my"], s: 1 },
  { word: "computer", syl: ["com", "pu", "ter"], s: 1 },
  { word: "machine", syl: ["ma", "chine"], s: 1 },
  { word: "security", syl: ["se", "cu", "ri", "ty"], s: 1 },
  { word: "performance", syl: ["per", "for", "mance"], s: 1 },
  { word: "category", syl: ["cat", "e", "go", "ry"], s: 0 },
];

/** Danh sách từ kèm phiên âm, lấy từ ví dụ của các âm (không trùng). */
export const WORDS: { word: string; ipa: string }[] = (() => {
  const seen = new Set<string>();
  const out: { word: string; ipa: string }[] = [];
  SOUNDS.forEach((s) => s.ex.forEach((e) => {
    const [word, ipa] = e.split("|");
    if (!seen.has(word) && /^[a-z]+$/.test(word)) { seen.add(word); out.push({ word, ipa }); }
  }));
  return out;
})();

// ---------- Tiến độ (lưu theo tài khoản trên máy chủ) ----------
export type Progress = Record<string, [number, number]>; // âm -> [đúng, tổng]
const OLD_KEY = "ipa-progress"; // bản cũ lưu trong trình duyệt, gộp lên tài khoản một lần
let cache: Progress = {};

export async function loadProgress(): Promise<Progress> {
  let old: Progress | null = null;
  try { old = JSON.parse(localStorage.getItem(OLD_KEY) || "null"); } catch { /* ignore */ }
  try {
    cache = old && Object.keys(old).length ? await post<Progress>("/api/me/ipa", { merge: old }) : await api<Progress>("/api/me/ipa");
    if (old) localStorage.removeItem(OLD_KEY);
  } catch { /* giữ cache */ }
  return cache;
}
/** Ghi ngay vào bộ nhớ để giao diện cập nhật, rồi gửi lên tài khoản. */
export function record(sound: string, ok: boolean): Progress {
  const [r, t] = cache[sound] || [0, 0];
  cache = { ...cache, [sound]: [r + (ok ? 1 : 0), t + 1] };
  post("/api/me/ipa", { sound, ok }).catch(() => { /* ignore */ });
  return cache;
}
export const rate = (p: Progress, s: string) => (p[s] && p[s][1] ? p[s][0] / p[s][1] : null);
export function weakest(p: Progress, n = 5) {
  return Object.entries(p).filter(([, [, t]]) => t >= 3).map(([s, [r, t]]) => ({ s, rate: r / t, t }))
    .filter((x) => x.rate < 0.8).sort((a, b) => a.rate - b.rate).slice(0, n);
}
