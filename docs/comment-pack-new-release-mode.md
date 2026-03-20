# comment-pack「新曲モード」（基本のみ・自由3本なし）

## 条件

- YouTube Data API（`YOUTUBE_API_KEY`）で取得した動画の **`publishedAt`** から、**現在時刻まで 30 日以内**なら「新曲」と判断する。
- API キー未設定などで `publishedAt` が取れない場合は **従来どおり**（基本＋自由3本）。

## 挙動

- **基本コメント（ai_commentary）のみ**生成し、末尾に固定の **【注釈】** を付与する。
- **自由コメント 3 本（ai_chat_1〜3）は生成しない**し、クライアントへも **空配列**で返す。
- DB には **ai_commentary 1 行だけ**保存する（新曲時）。

## キャッシュ

- 新曲時は `getStoredNewReleaseCommentPack` を使う。本文に `【注釈】新曲と判断したため` を含む最新の `ai_commentary` がヒットすればライブラリから返す。
- 新曲でない動画は従来どおり **4 本そろい**の `getStoredCommentPackByVideoId`。

## 定数・コード

- 注釈文言・マーカー: `src/lib/song-tidbits.ts` の `COMMENT_PACK_NEW_RELEASE_DISCLAIMER`
- 日数: `src/app/api/ai/comment-pack/route.ts` の `NEW_RELEASE_DAYS`（既定 30）

## レスポンス

- 新曲モード時のみ `newReleaseOnly: true` が JSON に含まれる（デバッグ・将来の UI 用）。
