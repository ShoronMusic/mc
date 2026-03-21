# 管理画面: AI NEW / DB 分析

## 目的

曲貼り付け後の AI コメント（comment-pack / 旧 commentary）や豆知識（tidbit）について、**発言1件ごと**にライブラリ再利用（`[DB]`）か都度生成（`[NEW]`）かを集計し、**DB 再利用の割合**と **実際の Gemini API 呼び出し** を並べて確認できます。ライブラリ（`song_tidbits` 等）を厚くして API 呼び出しを減らす施策の効果測定に使います。

## 開き方

`/admin` ダッシュボードの **「AI NEW / DB 分析」**、または `/admin/ai-comment-origin`。

## 前提

- **STYLE_ADMIN_USER_IDS** に自分の UID、**SUPABASE_SERVICE_ROLE_KEY**、管理者でログイン（他の管理画面と同じ）。
- **`room_chat_log`** … チャット永続化を有効にしていること（`docs/supabase-room-chat-log-table.md`）。
- **`gemini_usage_logs`** … 任意。無い場合は画面下半分の API 集計のみ表示されません。

## 集計の意味

| 項目 | データ源 | 意味 |
|------|-----------|------|
| [NEW] / [DB] 発言 | `room_chat_log`（`message_type = ai`） | 本文が `[NEW]` または `[DB]` で始まるか。アプリが付与しているプレフィックス。 |
| その他 | 同上 | チャット返答・案内・announce などプレフィックス無し。 |
| DB 比率 | NEW+DB のみ | `DB / (NEW+DB)`。高いほど再利用が進んでいる。 |
| 曲解説・comment-pack API | `gemini_usage_logs` の `commentary`, `comment_pack_*` | **課金が発生した**呼び出し。キャッシュヒット時は行が増えず、チャットには `[DB]` 発言だけが載ることがある。 |
| tidbit API | `gemini_usage_logs` の `tidbit` | 無言時豆知識。本文も `[NEW]`/`[DB]` 付き。 |

## 注意

- 集計は直近 N 日・最大走査行数に上限があります（大量データ時は画面に注記）。
- 料金の円換算は [Gemini 公式料金](https://ai.google.dev/pricing) の単価 × トークンで概算してください。
