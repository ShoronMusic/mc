# YouTube 視聴履歴の取り込み — 検討課題（保留）

> **ステータス**: **保留**（2026-07-08 相談メモ）  
> **対象**: **ma / mc 共通**（AI 以外のマイリスト・選曲 UX 想定）  
> **関連**: `docs/my-list-spec.md` · `docs/chrome-extension-musicaichat.md` · `docs/pwa-phase2-youtube-share-receive.md` · `docs/YouTubeURLから得られる曲情報.md`

---

## 1. 背景・要望

ユーザーは PC やスマホで YouTube（Web またはアプリ）を日常的に利用している。**ma / mc のログイン方法（Google OAuth / メール / ゲスト）に関係なく**、YouTube 側の視聴履歴（例: 直近 100 件）から **video ID → アーティスト・タイトル** を解決し、**選曲候補**として使えないか検討したい。

---

## 2. 結論（先に）

| 論点 | 結論 |
|------|------|
| ma / mc のログイン方法は関係する？ | **ほぼ関係しない**。必要なのは **端末の YouTube にユーザー自身の Google アカウントでログインしていること** |
| YouTube **公式 API** で視聴履歴を取れる？ | **いいえ**。YouTube Data API v3 は 2016-09 以降、watch history / watch later を **空リスト**で返す（`HL` / `WL` プレースホルダのみ） |
| video ID リストが取れたら選曲まで可能？ | **はい**。oEmbed / `videos.list` / `resolveArtistSongForPackAsync` / マイリスト等の **既存基盤で実装可能** |
| ボトルネックは？ | **履歴の取得経路**（API ではなくユーザー端末・Takeout・拡張等） |

---

## 3. ma / mc ログインと YouTube の関係

| ma / mc ログイン | YouTube 視聴履歴との関係 |
|------------------|--------------------------|
| Google OAuth | Google **認証**は共通になり得るが、現状 ma / mc は **YouTube スコープを要求していない** |
| メール登録 | ma / mc と YouTube は別アカウントでも、**ブラウザで YouTube に Google ログインしていれば**履歴は存在 |
| ゲスト | ma / mc 上はゲストでも、**同じ端末で YouTube にログインしていれば**履歴は存在 |

**現状の Google ログイン**（Supabase `signInWithOAuth({ provider: 'google' })`）は **認証専用**。YouTube データ API へのアクセス権は付与されない。

---

## 4. 取得ルート別の現実性

### 4.1 不可 — YouTube Data API v3

- `channels.list(mine=true)` → `contentDetails.relatedPlaylists.watchHistory` は常に `HL`
- `playlistItems.list(playlistId=HL)` → **空**
- OAuth で本人同意を取っても同様
- 参考: [YouTube Data API Revision History](https://developers.google.com/youtube/v3/revision_history)（2016-09-12 以降の仕様）

### 4.2 可能（PC 中心）— YouTube **Web**

ユーザーが `youtube.com` にログインした状態で、**ブラウザ上**から履歴を読む。

| 方式 | 概要 | 直近 N 件 | 備考 |
|------|------|-----------|------|
| **Chrome 拡張** | `youtube.com/feed/history` の DOM から video ID 抽出 | ◎ | 既存 `extensions/musicaichat-youtube-helper` の延長に相性良 |
| **拡張・逐次保存** | 動画ページを開くたび video ID を ma / mc に送る | △（一括100件即時ではない） | UX は自然。履歴は時間とともに蓄積 |
| **Google Takeout** | `watch-history.json` / `.html` をアップロード | ◎ | **公式の個人データ持ち出し**。スマホも含め共通 |

**Web スクレイピングの注意**

- YouTube の HTML / infinite scroll 変更で **壊れやすい**
- Shorts・ライブ・非音楽が混ざる → **音楽フィルタ**が必要
- サービス提供時は **プライバシーポリシー・削除・保存範囲の明示**が必須
- 利用規約上グレー（個人ツールは多いが、プロダクトとしてはリスク認識）

### 4.3 困難 — YouTube **ネイティブアプリ**（iOS / Android）

| 方式 | 現実性 |
|------|--------|
| アプリから ma / mc へ **一括自動同期** | **× ほぼ不可**（サンドボックス、外部 DOM/API なし） |
| **1 曲ずつ共有**（既存 PWA Share Target 等） | ○ 可能だが100件一括には不向き |
| **Google Takeout** → ma / mc に ZIP アップロード | ○ **スマホユーザー向けの現実解** |

---

## 5. ma / mc 側で既に使える処理（video ID 取得後）

| ステップ | 既存資産 |
|----------|----------|
| メタデータ取得 | oEmbed / `src/lib/youtube-search.ts`（`videos.list`） |
| アーティスト・曲名分解 | `resolveArtistSongForPackAsync` / `format-song-display.ts` |
| Music8 補強 | `src/lib/music8-musicaichat.ts` |
| 保存・選曲 UI | マイリスト（`user_my_list_items`）、貼った曲（`user_song_history`） |
| 趣向・提案 | `gather-user-taste-signals.ts`、AI 趣向要約 |

**100 件のメタデータ**: `videos.list` を 50 件ずつ ≒ **クォータ 2 単位**程度。

---

## 6. 想定アーキテクチャ（未実装）

```
[ユーザー端末]
  YouTube Web（ログイン済み） ──拡張/DOM──┐
  Google Takeout（watch-history） ──ZIP──┤
  YouTube アプリ ──共有1曲 / Takeout───┘
                    │
                    ▼ video ID[] + watched_at（任意）
              POST /api/user/youtube-history-import（案）
                    │
                    ▼
              videos.list / oEmbed / アーティスト分解
                    │
                    ▼
              マイページ「取り込み曲」 or マイリスト候補 → 部屋で選曲
```

**DB 案**（未確定）: `user_youtube_imported_history` 等の専用テーブル、またはマイリストへの一括候補投入。

---

## 7. 段階案（再開時のたたき台）

| Phase | 内容 | 備考 |
|-------|------|------|
| **0** | ma / mc 内データ（貼った曲・マイリスト・趣向）から選曲強化 | YouTube 連携なし。既存資産 |
| **1 POC** | Takeout `watch-history` アップロード → 直近 100 件パース → 候補一覧 | スマホ含む。公式ルート |
| **2** | Chrome 拡張で `feed/history` から一括取り込み | PC 中心。UX 良 |
| **3** | 拡張で動画ページ訪問時に逐次キューへ | 継続同期。スクレイピングより安定 |
| **見送り** | YouTube Data API による自動同期 | 公式に道なし |

**再開時の優先候補**（未決定）:

1. PC Chrome 拡張 + `feed/history` 100 件一発
2. Takeout アップロード POC（拡張なし・全端末）

---

## 8. プロダクト上の論点（未整理）

- **対象**: ゲストは ma / mc 側に保存先が薄い → **登録ユーザー向け**が自然
- **ノイズ**: 音楽以外（Shorts、実況等）のフィルタ UI
- **選曲 UX**: マイページ一覧 / 部屋モーダル / AI 趣向との統合
- **プライバシー**: 視聴履歴はセンシティブ — 保存期間・削除・他ユーザー非公開
- **コスト**: メタデータ取得は安い。全件 AI 分類は Gemini コスト別途
- **ma / mc**: AI 以外は共通化方針（`docs/00-music-chat-product-plan.md` §2.0）に従い **1 実装**

---

## 9. 関連ドキュメント・コード

| 種別 | パス |
|------|------|
| マイリスト企画 | `docs/my-list-spec.md` |
| Chrome 拡張 | `docs/chrome-extension-musicaichat.md` |
| PWA 共有（1 曲） | `docs/pwa-phase2-youtube-share-receive.md` |
| URL から得られる曲情報 | `docs/YouTubeURLから得られる曲情報.md` |
| 貼った曲履歴 API | `src/app/api/song-history/route.ts` |
| 趣向シグナル | `src/lib/gather-user-taste-signals.ts` |

---

## 10. 変更ログ

| 日付 | 内容 |
|------|------|
| 2026-07-08 | 初版 — 相談内容を検討課題として保留保存 |
