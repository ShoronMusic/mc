# 視聴履歴・メインアーティスト・ソングデータ・年代／スタイル分布・チャットサマリー・入室時開催モニター・鍵（入室制限）— 機能一覧

本書は **部屋周辺 UI** における上記機能の役割・データ源・API・表示条件を外部 AI や新メンバー向けに整理したもの。視聴履歴まわりの実装の起点は `src/components/room/RoomPlaybackHistory.tsx`（視聴履歴パネル本体）および `RoomWithSync.tsx` / `RoomWithoutSync.tsx`（モーダル・POST スケジュール）。**開催状況・入室ゲート**は `JoinGate` / `runRoomEntryGateCheck` と `GET /api/room-live-status` を起点にする。

---

## 1. 視聴履歴（一覧タブ）

| 項目 | 内容 |
|------|------|
| **UI** | プレイヤー下のパネル先頭タブ「**視聴履歴**」。テーブル列: 参加者名・時間（必要に応じ **R＝選曲ラウンド** 併記）・年代・スタイル・アーティスト–タイトル・YouTube リンク・お気に入り（♡）。 |
| **取得** | `GET /api/room-playback-history?roomId=…&clientId=…`（任意 `since`）。閲覧は **当該部屋の参加条件** または **Ably 在室に相当する clientId** でゲート（`src/lib/room-playback-history-access.ts`）。 |
| **記録** | 再生開始から約 **10 秒後**に投稿者クライアントが `POST /api/room-playback-history`（`roomId`, `videoId`, `displayName`, `isGuest`, `selectionRound`）。同一人同一曲 2 分以内は重複挿入しない等のルールあり。邦楽スキップ等は API 実装参照。 |
| **更新** | スタイル: `PATCH`（`id`, `videoId`, `style`）。アーティスト–タイトル: `PATCH`（STYLE_ADMIN 相当ユーザーが編集可 `/api/style-admin-check`）。 |
| **補助データ** | 行ごとの **年代** は `song_era` を `video_id` で JOIN した結果を GET 側で付与。 |
| **その他** | 現在再生中の行を強調。時間／参加者名でソート。日付区切り表示。STYLE_ADMIN 向けに「別タブで視聴」リンク。 |

**主なコード**: `src/components/room/RoomPlaybackHistory.tsx`, `src/app/api/room-playback-history/route.ts`, `docs/supabase-room-playback-history-table.md`（テーブル手順）。

---

## 2. メインアーティスト（タブ）

| 項目 | 内容 |
|------|------|
| **UI** | 視聴履歴パネル内のタブ「**メインアーティスト**」。**現在再生中の行**からアーティスト名・曲名を解決し、`MainArtistTabPanel` に渡す。 |
| **表示条件** | **Music8 のアーティスト JSON が HTTP 200 で取れたときだけ**タブを出す（先頭 fetch で存在チェック）。取れなければタブ非表示で「視聴履歴」に戻す。 |
| **データ源** | クライアントが `getMusic8ArtistJsonUrl(artistName)` の URL に `fetch`（外部 Music8 ホスト）。表示整形は `formatMusic8ArtistDisplayLines`（`src/lib/music8-artist-display.ts`）。 |
| **アーティスト名** | DB の `artist_name` / `title` が混在・誤順でも、有名 PV オーバーライドや `getArtistAndSong`＋正規化 `normalizeArtistNameForMusic8Lookup` で **lookup 用英字寄りのメインアーティスト** を組み立てる。 |
| **免責** | 未取得時は `ReferencedMusicDataDisclaimer` を表示。 |

**主なコード**: `src/components/room/MainArtistTabPanel.tsx`, `RoomPlaybackHistory.tsx`（`hasMainArtistData` / `playbackTabsResolve`）。

---

## 3. ソングデータ（タブ）

| 項目 | 内容 |
|------|------|
| **UI** | 視聴履歴パネル内のタブ「**ソングデータ**」。Music8 由来の **リリース・スタイル・ジャンル・説明文** 等を上から表示（`extractMusic8SongFields`）。 |
| **表示条件** | **曲 JSON が取れたときだけ**タブ表示。チェック順: (1) `GET /api/music8/musicaichat-by-video?videoId=…` に `song` があれば採用 (2) なければ `fetchMusic8SongDataForPlaybackRow(artistName, songTitle)`（従来 songs スラッグ系）。 |
| **引数** | `SongDataTabPanel`: `artistName`, `songTitle`, 任意 `videoId`（YouTube ID。あると musicaichat 経由を優先）。 |
| **免責** | `ReferencedMusicDataDisclaimer`。 |

**主なコード**: `src/components/room/SongDataTabPanel.tsx`, `src/lib/music8-song-lookup.ts`, `src/lib/music8-song-fields.ts`。

---

## 4. 年代分布（モーダル）

| 項目 | 内容 |
|------|------|
| **UI** | 視聴履歴パネルヘッダの **カレンダーアイコン「年代」** → モーダル「**年代分布**」。棒グラフ風にカテゴリ別件数。 |
| **モード** | **`24h`**: 直近 24 時間の `room_playback_history` 行を対象。**`last100`**: 当該部屋の直近 100 再生行。 |
| **集計** | 各行の `video_id` を `song_era` と突き合わせ、年代ラベルごとに **再生 1 行＝1 カウント**。`song_era` 未導入時は全体を「未設定」扱いになり得る（API 実装参照）。 |
| **API** | `GET /api/room-playback-era-stats?roomId=…&mode=24h|last100` → `{ total, counts }`。 |

**主なコード**: `src/components/room/EraDistributionModal.tsx`, `src/app/api/room-playback-era-stats/route.ts`, `src/lib/song-era-options.ts`（表示順のベース）。

---

## 5. スタイル分布（モーダル）

| 項目 | 内容 |
|------|------|
| **UI** | 視聴履歴パネルヘッダの **チャートアイコン「スタイル」** → モーダル「**スタイル分布**」。 |
| **モード** | 年代と同様 **`24h` / `last100`**。 |
| **集計** | `room_playback_history.style` を **再生 1 行＝1 カウント**（未設定キーは API／UI で「未設定」等として扱う）。 |
| **API** | `GET /api/room-playback-style-stats?roomId=…&mode=24h|last100` → `{ total, counts }`。 |

**主なコード**: `src/components/room/StyleDistributionModal.tsx`, `src/app/api/room-playback-style-stats/route.ts`, `src/lib/song-styles.ts`。

---

## 6. チャットサマリー（モーダル）

| 項目 | 内容 |
|------|------|
| **UI** | `UserBar` の「**チャットサマリー**」およびチャット欄内の同ボタン（`roomId` があるときのみ有効）。モーダルでテキストと集計を一覧表示。 |
| **API** | `GET /api/room-session-summary?roomId=…` |
| **時間窓** | **JST 基準の「部」**: **第1部 06:00–18:00**、**第2部 18:00–翌 06:00**（深夜 0–6 時は前日 part2 に含める）。現在時刻までを `played_at` / `created_at` の上限として集計。 |
| **データ範囲** | **視聴**: `room_playback_history` を当該窓で最大 2000 件。**チャット**: `room_chat_log` を同窋で最大 5000 件。**開催中の会**がある場合は `gathering_id` でチャットを絞る。 |
| **レスポンス項目** | `sessionWindowLabel`, `summaryText`（**ルールベースの日本語短文**。Gemini 生成ではない）、`participants`, `participantSongCounts`, `eraDistribution`, `styleDistribution`, `popularArtists`（上位5）, `popularTracks`（上位5）, `activeFromAt` / `activeToAt`, `dateJst`, `sessionPart` 等。 |
| **集計ロジックの注意** | 参加者は **user メッセージ**と再生ログの `display_name` の和集合（ゲスト接尾語 `(G)` は正規化で除去）。年代は **session 内の再生**に対応する `song_era` を参照。スタイルは **`room_playback_history.style`**（空は Other 寄せの正規化あり）。 |

**主なコード**: `src/components/room/RoomWithSync.tsx` / `RoomWithoutSync.tsx`（`openChatSummaryModal`）、`src/app/api/room-session-summary/route.ts`。

---

## 7. 入室時の開催中モニター（開催状況の把握と入室ゲート）

「モニター」は **トップで開催中部屋を一覧する UI** と、**部屋 URL 入室直前に開催可否を確認するゲート**の両方を含む。

### 7.1 トップページ：開催中部屋の一覧（定期ポーリング）

| 項目 | 内容 |
|------|------|
| **UI** | `HomeRoomLinks` が **約 20 秒ごと**に `GET /api/room-live-status?rooms=…` で開催中（`room_gatherings.status = live`）の部屋を取得し、カード表示。 |
| **表示** | 会タイトル／`room_lobby_message` の **部屋表示名**、部屋 ID、**開催中**バッジ。`GET /api/room-presence` と組み合わせ **在室人数・名前プレビュー**（取得中／エラー表示あり）。ロビー PR 文・邦楽解禁フラグがあれば併記。 |
| **鍵連動** | `join_locked` かつ `canEnter === false` のときはバッジを **「開催中 🔒 新規締切」** とし、**リンクを無効化**（カードのみ。新規は入室導線に乗せない）。 |
| **主なコード** | `src/components/home/HomeRoomLinks.tsx` |

### 7.2 部屋入室前：JoinGate と同一条件のチェック

| 項目 | 内容 |
|------|------|
| **呼び出し** | `runRoomEntryGateCheck(roomId)`（`src/lib/join-gate-room-check-client.ts`）。`JoinGate` の同意後フロー、名前入力後・URL 直後など **入室前の共通ゲート**として利用。 |
| **1. 開催管理** | `GET /api/room-live-status?roomId=…` の `configured !== true` なら「開催管理の準備中」扱いで拒否。 |
| **2. 開催中** | `room.isLive !== true` かつ **体験部屋 ID でない**場合は「開催中の会はありません」で拒否。 |
| **3. 鍵** | `join_locked` かつ `canEnter === false` のとき「新規参加を締め切っています（既参加者は再入室可）」で拒否（`canEnter` は API 側で主催者・**当該会に既参加記録があるログインユーザー**は true になり得る。詳細は `room-live-status`）。 |
| **4. 主催者先行** | `GET /api/room-presence` で在室 **0 人**かつ **主催者でない**かつ体験部屋でない場合は「主催者の入室待ち」で拒否（presence 取得失敗時はこの段階をスキップし live のみで通す）。 |
| **成功時** | `liveTitle`（会タイトル）・`roomDisplayTitle`（ロビー表示名）を返し、入室 UI へ進む。 |

**主なコード**: `src/lib/join-gate-room-check-client.ts`, `src/components/auth/JoinGate.tsx`, `src/app/api/room-live-status/route.ts`, `src/app/api/room-presence/route.ts`

**仕様・SQL**: `docs/room-live-session-spec.md`

---

## 8. 鍵機能（入室制限 / `join_locked`）

| 項目 | 内容 |
|------|------|
| **意味** | 開催中の会（`room_gatherings` の `status = 'live'`）に対し **`join_locked = true`** にすると、**新規の入室ゲートを閉じる**（既に当該会に参加履歴があるユーザー・主催者は再入室可、という整理。実判定は `room-live-status` の `canEnter`）。 |
| **データ** | `room_gatherings.join_locked`（列未作成時は `room-gatherings` API が 503 と案内メッセージ）。 |
| **操作 API** | `POST /api/room-gatherings` with `{ "action": "set_lock", "roomId": "…", "locked": true|false }`。**開催中の会が 1 件ある部屋**に対して更新。会が無いと 404。 |
| **部屋内 UI** | `RoomWithSync` で **オーナー制御が使えるユーザー**向けにトグルボタン（保存中は disabled）。成功時にシステムメッセージで「新規参加を締め切りました／解除しました」を表示。 |
| **ユーザー向け文言** | 締切時: 「この会は新規参加を締め切っています（既参加者は再入室できます）。」 |

**主なコード**: `src/app/api/room-gatherings/route.ts`（`set_lock`）, `src/components/room/RoomWithSync.tsx`（`joinLocked` / `set_lock` 呼び出し）, `src/app/api/room-live-status/route.ts`（`canEnter` 算出）

---

## 9. チャットサマリーと「年代／スタイル分布」モーダルの違い（要約）

| 観点 | 視聴履歴パネル内の分布モーダル | チャットサマリー |
|------|-------------------------------|------------------|
| **対象時間** | **24h** または **直近100再生**（部屋単位） | **当日 JST の第1部／第2部**の固定窓（進行中は現在まで） |
| **主目的** | 直近の再生傾向の可視化 | **途中参加**向けに「いまの部の流れ」を一文＋指標で把握 |
| **summary 本文** | なし（グラフのみ） | **定型テンプレ＋集計結果**の `summaryText` |

---

## 10. 関連ドキュメント

- **参加方法**（Google・メール＋パスワード・ゲスト、`JoinGate` / `JoinChoice`）: `docs/mypage-external-ai-brief.md` §1
- ライブ会・ロビー・鍵列・主催者: `docs/room-live-session-spec.md`
- 視聴履歴テーブル: `docs/supabase-room-playback-history-table.md`
- 視聴履歴とスタイル／時代の設計メモ: `docs/room-playback-history-style-era-artist-design.md`
- Music8 / musicaichat 連携: `AGENTS.md`（Music8 節）、`docs/music8-musicaichat-json-spec.md`
- 管理画面の日次サマリー（別系統: DB 保存・Gemini 等）: `src/app/admin/room-daily-summary/` — 本書の **チャットサマリー（`/api/room-session-summary`）とは別機能**。

---

## 11. 参加方法（入室前の認証・ゲスト）— 相互参照

入室前に **Google OAuth**・**メール＋パスワード（簡易会員）**・**ゲスト**の三経路があり、開催チェック（§7）・鍵（§8）より**前段**で `JoinChoice` に集約される。詳細な表・ストレージキー・Supabase 未設定時の挙動は **`docs/mypage-external-ai-brief.md` §1** に集約した。

**主なコード**: `src/components/auth/JoinGate.tsx`, `JoinChoice.tsx`, `SimpleAuthForm.tsx`, `TopPageLoginEntry.tsx`, `GuestRegisterPromptModal.tsx`

---

*実装同期: `RoomPlaybackHistory.tsx` のタブ名・存在チェック、`room-session-summary/route.ts` の集計と `summaryText` 生成、`join-gate-room-check-client.ts` と `room-live-status` の `canEnter`、参加導線は `JoinChoice` / `SimpleAuthForm` に準拠。*
