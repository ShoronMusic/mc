# comment-pack「新曲モード」（基本のみ・自由コメントなし・DB非保存）

## 条件

- YouTube Data API（`YOUTUBE_API_KEY`）で取得した動画の **`publishedAt`** から、**現在時刻まで 30 日以内**なら「新曲」と判断する（`shouldApplyCommentPackNewReleaseMode`）。
- Music8 原盤日や概要欄の古いリリース年でカタログ曲と分かる場合は新曲モードにしない。
- API キー未設定などで `publishedAt` が取れない場合は **従来どおり**（基本＋自由コメント・DB 保存）。

## 挙動

- **基本コメント（ai_commentary）のみ**生成し、末尾に固定の **【注釈】** を付与する。
- **自由コメントは生成しない**し、クライアントへも **空配列**で返す。
- **`song_tidbits` には保存しない**（新曲の推測コメントをライブラリに残さない）。**公開から 30 日超**の曲のみ保存・キャッシュする。

## キャッシュ

- 新曲時は DB キャッシュを参照せず、毎回新規生成する。
- 新曲でない動画は従来どおり **4 本そろい**の `getStoredCommentPackByVideoId`。

## 定数・コード

- 注釈文言: `src/lib/song-tidbits.ts` の `COMMENT_PACK_NEW_RELEASE_DISCLAIMER`
- 判定: `src/lib/comment-pack-new-release.ts`（`COMMENT_PACK_NEW_RELEASE_DAYS` = 30）
- 生成・非保存: `src/app/api/ai/comment-pack/route.ts`

## レスポンス

- 新曲モード時のみ `newReleaseOnly: true` が JSON に含まれる（デバッグ・将来の UI 用）。
