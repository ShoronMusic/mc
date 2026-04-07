# MUSIC AI CHAT 連携 Chrome 拡張機能

洋楽チャット（MUSIC AI CHAT）向けの **YouTube 連携拡張**について、現状の実装と今後の拡張計画をまとめたメモです。

## 目的

- YouTube で視聴・検討中の動画について、**別タブで開いたままのチャット部屋**の発言欄へ、正規化した `watch?v=` 形式の URL を渡す。
- 将来的には、同じ UI を **マイページでの個人ライブラリ保存**（タグ・カテゴリ等）への入り口にもする。

## 現状（v0.1.0 相当）

### ユーザー向け動作

1. **洋楽チャットの部屋**をブラウザで開いておく（推奨: YouTube と**同じウィンドウ**）。
2. **YouTube**（`youtube.com` / `youtu.be` / `m.youtube.com` / `music.youtube.com`）の動画ページで、ツールバーの**拡張アイコン**をクリック。
3. **モーダル**が開く。表示されている URL は可能な範囲で `https://www.youtube.com/watch?v=...` に正規化。
4. **「この曲を選択」**で、同じウィンドウ内の洋楽チャットタブ（後述のホストにマッチするもののうち、直近アクセス優先）を前面にし、**発言欄に URL を入力**する（**送信は手動**）。
5. **「閉じる」**または背景クリックでモーダルを閉じる。

### 技術構成

| 項目 | 内容 |
|------|------|
| マニフェスト | Manifest V3 |
| 権限 | `scripting`, `tabs` |
| バックグラウンド | Service Worker（`service-worker.js`） |
| YouTube 側 | コンテンツスクリプト（`content-youtube.js`）＋ Shadow DOM のモーダル |
| チャット側 | `chrome.scripting.executeScript` の **world: `MAIN`** で `window` に `CustomEvent` を発火 |

### リポジトリ上のパス

| パス | 役割 |
|------|------|
| `extensions/musicaichat-youtube-helper/manifest.json` | 拡張定義・ホスト権限 |
| `extensions/musicaichat-youtube-helper/service-worker.js` | アイコンクリック、タブ検索、MAIN ワールドへのイベント注入 |
| `extensions/musicaichat-youtube-helper/content-youtube.js` | モーダル UI・正規化 URL の表示 |
| `extensions/musicaichat-youtube-helper/INSTALL.txt` | パッケージ化されていない拡張としての読み込み手順（短文） |
| `src/lib/musicai-extension-events.ts` | イベント名定数（拡張の `service-worker.js` と**同一文字列**を維持すること） |
| `src/components/chat/ChatInput.tsx` | 上記イベントを購読し、React の `value` を更新してフォーカス |

### 洋楽チャットタブの判定（開発用）

`service-worker.js` の `isMusicAiTabUrl` は現状、次を対象としている。

- `localhost` / `127.0.0.1`（任意ポート想定のマッチパターン）
- `*.vercel.app`

本番ドメインのみ運用する場合は、ストア用ビルドで **ホスト権限とこの関数を本番オリジンに合わせて絞る**（後述）。

### データの扱い（プライバシー・現状）

- 拡張コード内に **`fetch` / 解析ビーコン等はない**。開発者のサーバーへ URL を送る処理は**実装していない**。
- 行っているのは、ユーザー操作に応じた **ブラウザ内**での URL の受け渡し（YouTube タブ → 洋楽チャットの入力欄）のみ。

Chrome Web Store の申告では、「収集して外部送信する」とは別枠で **ページ／URL へのアクセス**について問われることがあるため、フォームの項目ごとに読み、**用途に沿って正直に記載**する。

## 開発者向け：ローカルで試す

1. `npm run dev` で洋楽チャットを起動し、部屋を開く。
2. Chrome → `chrome://extensions` → デベロッパーモード → **パッケージ化されていない拡張機能を読み込む** → `extensions/musicaichat-youtube-helper` を指定。

詳細は `extensions/musicaichat-youtube-helper/INSTALL.txt` を参照。

## Chrome Web Store 公開・本番ドメイン専用化（プロセス概要）

1. **拡張の整理**  
   - `host_permissions` からローカル／プレビュー用を外し、**本番 `https://（ドメイン）/*` のみ**にする（審査では最小権限が重視される）。  
   - `isMusicAiTabUrl` を同じホストに合わせる。  
   - `name` / `description` を製品向け文言に変更。`version` を更新。
2. **ストア用素材**  
   - アイコン（少なくとも 128×128）、スクリーンショット、短い説明・詳細説明。  
   - サーバー送信を追加した時点から **プライバシーポリシー URL** とデータ申告が必須になりやすい（現状の URL のみの受け渡しでは、外部「収集・送信」には該当しないが、設問は項目ごとに確認）。
3. **開発者ダッシュボード**  
   - 登録・ワンショット登録料（公式の最新額はダッシュボード表示を参照）。  
   - ZIP をアップロード（`manifest.json` が ZIP 直下）。審査 → 公開。

## 今後の拡張計画（ロードマップ案）

### フェーズ A：体験の磨き込み

- 本番ドメイン用 **manifest の切り替え**（開発用とストア用の分離やビルドスクリプト）。
- モーダル文言・アクセシビリティ（フォーカストラップ、Esc で閉じる等）の改善。
- 複数部屋タブがあるときの **明示的なタブ選択**（オプション）。

### フェーズ B：マイページ・個人ライブラリの入り口

**詳細な企画・設計は `docs/my-list-spec.md`（マイリスト）を参照。**

- モーダルに **「マイリストに保存」**（名称は製品文言で確定）を追加。チャット参加は**必須にしない**方針。
- ログイン済みの洋楽チャットと **同一ブラウザセッション**を利用し、`credentials: 'include'` で **Next.js の API Route** に POST（拡張から直接 Supabase せず、アプリ側で検証・保存するのが安全）。
- 保存項目の段階的導入：  
  - まず `video_id`（または正規化 URL）＋**アーティスト・タイトル**（自動候補＋ユーザー編集）＋任意メモ。  
  - 次に **タグ・ジャンル**（上級者向け）。Music8 は **当該曲データがあるときの参考**程度（必須にしない）。

### フェーズ C：ストア・運用

- サーバー送信を含む場合の **プライバシーポリシー**更新とストア申告の更新。
- オプション画面（**追加で許可するオリジン**の `optional_host_permissions` など）が必要になった場合の設計。

### フェーズ D：連携の拡大（任意）

- ライブラリ一覧・編集 UI は **マイページ**を主とし、拡張はあくまで **YouTube 上の起点**に集中。
- 既存の視聴履歴（`song-history` 等）との **統合 or 別テーブル**はプロダクト判断で決定。

## 関連ドキュメント・コード

- プロジェクト全体の索引: ルートの `AGENTS.md`
- Supabase・認証: `docs/supabase-setup.md`

---

*この文書は拡張の仕様変更に合わせて更新してください。イベント名を変える場合は `musicai-extension-events.ts` と `service-worker.js` を必ず同期すること。*
