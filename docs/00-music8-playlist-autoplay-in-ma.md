# Music8 プレイリスト → ma チャット連続再生（実装プロジェクト）

**ステータス**: MVP 実装済み（Phase 1〜3。Ably 同期・停止 UI は Phase 4）  
**目的**: [music8](https://xs867261.xsrv.jp/md/) で作ったプレイリストを、[洋楽AIチャット（ma）](https://www.musicai.jp/) のチャット欄に URL を貼るだけで連続選曲・再生する。  
**作業リポジトリ**: `E:\mc`（本ドキュメントの実装対象）  
**m8（WordPress）**: **必須改修なし**（既存 REST で足りる。任意改善のみ末尾に記載）

関連メモ:
- YouTube プレイリスト連続再生の旧設計: [`playlist-autoplay-ai-plan.md`](./playlist-autoplay-ai-plan.md)（本プロジェクトは **Music8 CPT プレイリスト**が対象。YouTube PL は別）
- Music8 WP REST（曲1件）: `src/lib/music8-wp-rest.ts`
- 選曲予約キュー仕様: [`room-selection-turn-order-spec.md`](./room-selection-turn-order-spec.md)

---

## 1. ユーザー体験（完成形）

1. ma の部屋チャット欄に、次のような **Music8 プレイリスト URL だけ**を貼って送信する。

   ```
   https://xs867261.xsrv.jp/md/playlist/dance-pop/
   ```

2. システムが曲一覧（YouTube ID 付き）を取得する。
3. **1曲目を即再生**し、残りを **プレイリスト専用オートプレイキュー**に積む。
4. 曲終了ごとに次曲へ進む。
5. チャットに短い確認メッセージを出す（例: `Music8「Dance-pop」39曲を連続再生します（公開日が新しい順）`）。

操作は「URL を貼る」以外を求めない。

### 例

| 入力 | 期待 |
|------|------|
| `https://xs867261.xsrv.jp/md/playlist/dance-pop/` | Dance-pop の曲を連続再生 |
| `https://xs867261.xsrv.jp/md/playlist/afrobeats/` | 同様 |
| 通常の YouTube 動画 URL | **従来どおり** 1曲選曲（本機能と干渉しない） |
| Yahoo 等の非 YouTube URL | **従来どおり** 非対応案内 |

---

## 2. m8 側の結論（改修不要）

### 既に使える公開 API

```http
GET https://xs867261.xsrv.jp/md/wp-json/custom/v1/playlist/{slug}
```

実装: `E:\wp\rectusminimum\functions.php` → `get_playlist_details()`

実測例（`dance-pop`）:
- プレイリスト `id` / `title` / `description` / `thumbnail`
- `songs[]` 各要素に **`yt_video_id`**（11文字 YouTube ID）、`first_artist`、`title`、`post_date`、`id`（WP 曲 ID）など

ブラウザからの直接 fetch は **CORS 未設定**のため不可。  
→ **ma のサーバー API がプロキシする**ため、m8 に CORS 追加は必須ではない。

### 公開ページとの差分（ma 側で吸収）

| 項目 | 公開ページ `single-playlist.php` | REST `get_playlist_details` |
|------|----------------------------------|-----------------------------|
| 曲順 | `post_date` DESC（新しい順） | `playlist_songs` 登録順（`post__in`） |
| YouTube キー | （ページ内 JS） | `yt_video_id` |

**方針**: ma プロキシで `post_date` DESC にソートして返す。m8 本体の改修は不要。

### （任意）後から m8 に足してもよいもの

必須ではない。余裕があれば:

1. `?order=date_desc` クエリ対応
2. レスポンスに `videoId` エイリアス（`yt_video_id` と同値）
3. CORS 許可オリジン（`musicai.jp` / localhost）— プロキシ採用なら不要

---

## 3. ma 側の現状（ブロッカー）

| 事実 | 場所 |
|------|------|
| 単独の非 YouTube URL は選曲せずシステム案内のみ | `src/lib/youtube.ts` → `isStandaloneNonYouTubeUrl` / `src/lib/chat-non-youtube-url.ts` |
| Chat 送信時に上記で弾く | `src/components/chat/ChatInput.tsx` → `handleSubmit` |
| 部屋側でも二重ガード | `RoomWithSync.tsx` / `RoomWithoutSync.tsx` → `handleSendMessage` |
| 既存選曲予約キューは **同一ユーザー同時1曲** | `songReservationQueueRef` + `queueSong`（[`room-selection-turn-order-spec.md`](./room-selection-turn-order-spec.md)） |
| Music8 曲1件の WP REST はあるが **プレイリスト未呼び出し** | `src/lib/music8-wp-rest.ts` |

**結論**: 既存 `queueSong`（1人1予約）は流用しない。専用オートプレイキューを新設する。

---

## 4. アーキテクチャ

```text
[ユーザー] チャットに m8 プレイリスト URL を貼る
    │
    ▼
ChatInput.handleSubmit
  ├─ YouTube 動画 URL? → 従来の onVideoUrl
  ├─ Music8 プレイリスト URL? → onMusic8PlaylistUrl(url)  ★新規
  ├─ その他の単独 URL? → NON_YOUTUBE 案内
  └─ 通常文 → onSendMessage
    │
    ▼
RoomWithSync / RoomWithoutSync
  fetch POST /api/music8/playlist  { url }
    │
    ▼
サーバー: MUSIC8_WP_REST_BASE_URL + /custom/v1/playlist/{slug}
  → 正規化（videoId / artist / title）
  → post_date DESC ソート
  → 空 videoId 除外・重複除外・上限 N
    │
    ▼
専用キュー music8PlaylistAutoplayRef
  先頭: applyImmediateChangeVideo（または同等の即時再生）
  以降: player ended → 次の videoId
  MVP: aiMode = 'none'（コスト抑制）
```

### なぜサーバープロキシか

- m8 に CORS がない
- WP のベース URL を env で切り替え可能（`MUSIC8_WP_REST_BASE_URL` 既存）
- クライアントに WP 直叩きを露出させない

---

## 5. 実装タスク（ファイル単位）

### Phase 0 — 準備（半日以内）

- [ ] 本ドキュメントを正本にする（このファイル）
- [ ] `.env.local` に `MUSIC8_WP_REST_BASE_URL` があることを確認（未設定時の既定は `https://xs867261.xsrv.jp/md/wp-json`）
- [ ] 手動で API 疎通:  
  `curl "https://xs867261.xsrv.jp/md/wp-json/custom/v1/playlist/dance-pop"`  
  → `songs[].yt_video_id` が入っていること

### Phase 1 — URL 解析 + プロキシ API（MVP の土台）

#### 1-A. URL パーサ

**新規** `src/lib/music8-playlist-url.ts`

責務:
- Music8 プレイリスト URL かどうか判定
- slug 抽出（例: `dance-pop`）
- 許容ホスト: 既定 WP ホスト + env で追加可
- パスパターン: `/playlist/{slug}/`（末尾スラッシュ有無両対応）
- クエリ・ハッシュは無視

単体テスト: **新規** `src/lib/music8-playlist-url.unit-test.ts`

```ts
// 期待例
parseMusic8PlaylistUrl('https://xs867261.xsrv.jp/md/playlist/dance-pop/')
// → { slug: 'dance-pop', canonicalUrl: '...' }

isMusic8PlaylistUrl('https://www.youtube.com/watch?v=xxx') // false
isMusic8PlaylistUrl('https://xs867261.xsrv.jp/md/madonna/danceteria/') // false（曲ページ）
```

#### 1-B. プロキシ API

**新規** `src/app/api/music8/playlist/route.ts`

```http
POST /api/music8/playlist
Content-Type: application/json

{ "url": "https://xs867261.xsrv.jp/md/playlist/dance-pop/" }
```

または `{ "slug": "dance-pop" }`

成功レスポンス（正規化後）:

```json
{
  "ok": true,
  "source": "music8",
  "playlist": {
    "id": 128364,
    "slug": "dance-pop",
    "title": "Dance-pop",
    "url": "https://xs867261.xsrv.jp/md/playlist/dance-pop/",
    "description": "Genre Best",
    "thumbnail": "https://..."
  },
  "order": "date_desc",
  "truncated": false,
  "totalFetched": 39,
  "songs": [
    {
      "videoId": "gmPrQ1MSTNA",
      "title": "Us Against The World",
      "artist": "December 10",
      "music8SongId": 137228,
      "postDate": "2026-07-10"
    }
  ]
}
```

失敗:

```json
{ "ok": false, "reason": "invalid_url" | "not_found" | "upstream_error" | "empty_songs", "message": "..." }
```

実装メモ:
- 上流: `${getMusic8WpRestBaseUrl()}/custom/v1/playlist/${slug}`
- User-Agent: 既存 `music8-wp-rest.ts` と同様でよい
- タイムアウト: 15s 程度
- `songs` を `post_date` DESC でソート（欠損は末尾）
- `yt_video_id` を trim → `isLikelyYoutubeVideoId` で検証
- 上限: 既定 **40**（env `MUSIC8_PLAYLIST_AUTOPLAY_MAX` で上書き可、最大 80）
- レート制限: 既存 YouTube 検索 RL と同系統か、簡易 IP 制限を付ける

ヘルパー配置候補:
- `src/lib/music8-playlist-fetch.ts`（パース結果 → 正規化 tracks）
- または `music8-wp-rest.ts` に `fetchMusic8PlaylistBySlug` を追加

単体テスト: フィクスチャ JSON でソート・空 ID 除外・上限を検証。

### Phase 2 — チャット入力の分岐

#### 2-A. `ChatInput.tsx`

`handleSubmit` / キーワード検索入口で、**`isStandaloneNonYouTubeUrl` より前**に:

```ts
if (isMusic8PlaylistUrl(trimmed)) {
  onMusic8PlaylistUrl?.(trimmed);
  setValue('');
  return;
}
```

Props 追加:
- `onMusic8PlaylistUrl?: (url: string) => void | Promise<void>`

#### 2-B. `RoomWithSync.tsx` / `RoomWithoutSync.tsx`

1. `handleSendMessage` 冒頭の非 YouTube 拒否の前に Music8 PL 判定（送信経路に乗った場合の保険）。
2. `handleMusic8PlaylistUrl` を実装し `ChatInput` に渡す。

`handleMusic8PlaylistUrl` 概略:

```ts
async (url: string) => {
  // 1. ローディング系システムメッセージ（任意）
  const res = await fetch('/api/music8/playlist', { method: 'POST', body: JSON.stringify({ url }) });
  const data = await res.json();
  if (!data.ok || !data.songs?.length) {
    addSystemMessage(data.message || 'Music8プレイリストを読み込めませんでした。');
    return;
  }
  // 2. 専用キューにセット
  startMusic8PlaylistAutoplay(data);
}
```

### Phase 3 — 専用オートプレイキュー（核心）

既存 `songReservationQueue` / Ably `queueSong` とは **別**にする。

#### 状態（Room コンポーネント内）

```ts
type Music8PlaylistAutoplayState = {
  slug: string;
  title: string;
  songs: Array<{ videoId: string; title: string; artist: string; music8SongId?: number }>;
  index: number; // 現在再生中の index
  startedAt: string; // ISO
};
```

- `music8PlaylistAutoplayRef` + 表示用 state（任意）
- 開始時:
  - 既存オートプレイがあれば置き換え（または確認メッセージ後に置き換え）
  - `index = 0` で即時再生
  - システムメッセージ: タイトル・曲数・切り捨て有無
- `player` の `ended`（既存 `handlePlayerStateChange`）:
  - オートプレイ中かつ現在 `videoId` がキュー先頭一致なら `index++`
  - 次があれば再生（`applyImmediateChangeVideo` 相当、**aiMode: 'none'**）
  - なければクリアして「プレイリスト終了」メッセージ
- 手動で別 YouTube URL を選曲したら:
  - **MVP**: オートプレイを中止（システムメッセージ）
  - 将来: 一時停止／挿入ルール

#### 同期部屋（RoomWithSync）の MVP 方針

| 項目 | MVP |
|------|-----|
| 誰が開始できるか | ログインユーザー、かつ選曲参加中（複数人時は自分のターン or オーナー） |
| Ably 同期 | **最初はローカルのみでも可**（検証優先）。安定後に `music8PlaylistPlay` イベントを追加 |
| AI 解説 | **オフ**（全曲 comment-pack はコスト過大） |
| announce | 任意。MVP は先頭のみ or なし |

将来の Ably 型（Phase 4）:

```ts
{
  type: 'music8PlaylistPlay',
  slug: string,
  title: string,
  videoIds: string[],
  index: number,
  publisherClientId: string
}
```

`PlaybackMessage` / `src/types/playback.ts` への追加は同期実装時。

### Phase 4 — 同期・権限・停止 UI（磨き）

- [ ] Ably でキュー状態を部屋に共有
- [ ] 「連続再生を停止」ボタン or チャットコマンド（例: `プレイリスト停止`）
- [ ] スキップ（次へ）— オーナー／開始者のみ → **実装済み**: 参加者欄の「次曲へ」（連続再生維持）。従来の「スキップ」は連続再生を終了
- [ ] 複数人ターンとの衝突ルールを [`room-selection-turn-order-spec.md`](./room-selection-turn-order-spec.md) に追記
- [ ] `RoomWithoutSync` でも同等動作

### Phase 5 — 任意強化

- [ ] AI 解説を「先頭のみ」または「N 曲ごと」で有効化（フラグ）
- [x] ライブラリ・アーティスト全曲選曲（E列下部「全曲選曲」→ 同一オートプレイキュー。`library-artist-autoplay.ts`）
- [ ] マイリスト／再生履歴との連携
- [ ] 静的 JSON キャッシュ（GCS）— ライブ API で十分な間は不要
- [ ] m8 側 `order=date_desc` 正式対応（プロキシソートをやめる）

---

## 6. プロダクトルール（確定案）

実装前に変える場合は、この節を更新してからコードに落とす。

| ルール | MVP 決定 |
|--------|----------|
| 入力 | Music8 プレイリストの **公開ページ URL**（slug） |
| 曲順 | 公開日が新しい順（`post_date` DESC） |
| 上限 | 40 曲（超過は切り捨て + `truncated: true`）。**STYLE_ADMIN_USER_IDS** のログイン時のみ上限なし（AI 解説保存用） |
| AI 解説 | **各曲**（紹介・解説あり。コストは曲数に比例） |
| 既存 1曲予約キュー | 干渉しない（別系統） |
| 手動選曲 | オートプレイ中止 |
| ゲスト | MVP では不可（ログイン必須）でよい。必要なら後で開放 |
| 失敗時 | 再生を始めずメッセージのみ |

---

## 7. 受け入れ条件（完了判定）

### 必須

1. `https://xs867261.xsrv.jp/md/playlist/dance-pop/` を ma チャットに貼ると、連続再生が始まる。
2. 曲順が公開ページ（新しい順）と概ね一致する。
3. YouTube 動画 URL の従来選曲が壊れていない。
4. 無関係な URL 単独投稿は従来どおり拒否される。
5. `yt_video_id` が空の曲はスキップされる。
6. プレイリスト未存在時に分かりやすいエラーが出る。

### 推奨

7. 40曲超で切り捨てメッセージが出る。
8. 手動で別曲を選ぶと連続再生が止まる。
9. 単体テスト（URL パース・正規化）が通る。

---

## 8. 作業チェックリスト（Cursor / `E:\mc`）

コピーして Issue / チャットに貼って進捗管理してよい。

```text
[x] src/lib/music8-playlist-url.ts + unit-test
[x] src/lib/music8-playlist-fetch.ts（または music8-wp-rest 拡張）+ unit-test
[x] src/app/api/music8/playlist/route.ts
[x] ChatInput: onMusic8PlaylistUrl + 分岐順
[x] RoomWithSync: handleMusic8PlaylistUrl + autoplay ref + ended 進行
[x] RoomWithoutSync: 同上（最低限ローカル連続再生）
[x] システムメッセージ文言
[ ] 手動 E2E: dance-pop / afrobeats / 不正 URL / YouTube 動画 URL
[x] AGENTS.md に本ドキュメントへの一行リンクを追加（任意）
```

---

## 9. リスクと対策

| リスク | 対策 |
|--------|------|
| WP 一時ダウン | 明確なエラー。再送でリトライ |
| 削除・非公開 YouTube | 再生失敗時は次曲へスキップ（`YouTubePlayer` onError → 連続再生キュー進行） |
| 長尺 PL で部屋が「放置再生」 | 上限 40・手動選曲で中止 |
| AI コスト爆発 | MVP で解説オフを厳守 |
| 既存 queueSong と衝突 | 専用キュー。仕様書に明記 |
| ホスト変更 | env `MUSIC8_WP_REST_BASE_URL` + URL パーサのホスト許可リスト |

---

## 10. 参考：上流 JSON（生）の形

`GET /wp-json/custom/v1/playlist/dance-pop` 抜粋:

```json
{
  "id": 128364,
  "title": "Dance-pop",
  "description": "Genre Best",
  "thumbnail": "https://xs867261.xsrv.jp/md/wp-content/uploads/...",
  "songs": [
    {
      "id": 127798,
      "title": "I Could Get Used To This",
      "yt_video_id": "RV-ONO_Ok5c",
      "first_artist": "Jessie Ware",
      "artists": ["Jessie Ware"],
      "post_date": "2026-01-23",
      "genres": ["Boogie", "Dance-pop"]
    }
  ]
}
```

キー名は **`yt_video_id`**（musicaichat 静的曲 JSON の `videoId` とは異なる）。プロキシで必ず正規化する。

---

## 11. スコープ外（今回やらない）

- YouTube 公式プレイリスト URL の連続再生（[`playlist-autoplay-ai-plan.md`](./playlist-autoplay-ai-plan.md)）
- m8 管理画面や CPT の変更
- 週次 JSON 同期パイプラインとの結合
- お題プレイリスト・ミッションとの統合
- Chrome 拡張からの自動投入（将来可）

---

## 12. 引き継ぎ一文

> **m8 改修なし。** ma（`E:\mc`）でプレイリスト URL を検知し、既存 `custom/v1/playlist/{slug}` をサーバープロキシ経由で取得、専用オートプレイキューで連続再生する。曲順は `post_date` DESC。AI 解説は MVP では付けない。

Cursor で `E:\mc` を開いたら、**Phase 1（URL + API）→ Phase 2（Chat 分岐）→ Phase 3（キュー）** の順で実装する。
