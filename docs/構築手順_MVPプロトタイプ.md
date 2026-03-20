# Music8 Lounge MVP 構築手順

**スコープ**: 1ルーム・1動画の同期再生 ＋ チャット ＋ AI短い解説のみ

---

## 前提・技術スタック

| 項目 | 選定 |
|------|------|
| フレームワーク | Next.js 14+ (App Router) |
| スタイル | Tailwind CSS |
| リアルタイム | Socket.io（または Ably） |
| AI | Google Gemini API |
| DB（後で利用） | Supabase（MVPでは最小限 or スキップ可） |
| 動画 | YouTube IFrame Player API |

---

## Phase 0: 環境準備（所要目安: 30分）

1. **Node.js**
   - LTS（v20 推奨）が入っているか確認: `node -v`, `npm -v`

2. **プロジェクト作成**
   ```bash
   cd e:\mc
   npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --no-import-alias
   ```
   - 既に `e:\mc` に何かある場合は、サブフォルダ `e:\mc\lounge` で `create-next-app` しても可。
   - **ローカルで Music8 を 3001 で並行運用している場合**: 作成後の `package.json` の `scripts.dev` を `"next dev -p 3002"` にしておく。詳細は `docs/ローカル並行開発.md` を参照。

3. **必要なパッケージの追加**
   ```bash
   npm install socket.io socket.io-client
   npm install @google/generative-ai
   ```
   - バックエンドで Socket.io を使うため、別途 **Node サーバー**（Express 等）を立てるか、Next.js の API Route から Socket サーバーを起動する方式をあとで選ぶ。

4. **環境変数**
   - `.env.local` を作成し、`GEMINI_API_KEY=` を設定（Gemini API キーは Google AI Studio で取得）。

---

## Phase 1: 同期再生の土台（所要目安: 1〜2日）

**ゴール**: 1つの YouTube 動画を、全クライアントで同じタイミングで再生・一時停止できる。

1. **YouTube IFrame Player API の読み込み**
   - `src/components/YouTubePlayer.tsx` を作成。
   - 公式の IFrame Player API を script で読み込み、1つの `videoId` でプレイヤーを表示。

2. **再生状態の同期**
   - **案A**: Next.js API Routes では WebSocket が扱いづらいため、**別プロセスで Socket.io サーバー**（例: `server/index.js`）を立て、Next.js はフロントのみ。
   - **案B**: Vercel 等では Socket サーバーが使えないため、**Ably** などのマネージド Realtime を使う。
   - ここでは **Socket.io サーバーを別起動**する前提で進める。
   - 送受信するイベント例:
     - `play` … 再生開始（currentTime を送る）
     - `pause` … 一時停止（currentTime を送る）
     - `seek` … シーク（time を送る）
     - `sync` … 新規参加者への現在の状態（videoId, currentTime, playing）

3. **クライアント側**
   - 同じルーム（1ルーム固定でOK）に参加したら、Socket で `play` / `pause` / `seek` を受信し、YouTube プレイヤーの `seekTo`, `playVideo`, `pauseVideo` を呼ぶ。
   - 誰かが再生/停止したら、その操作をサーバー経由で全員に配信。

4. **URL の受け渡し**
   - 誰かが YouTube URL を入力したら、`videoId` を抽出して Socket で `changeVideo(videoId)` をブロードキャストし、全員のプレイヤーで同じ動画に切り替え。

**チェック**: 2つのブラウザで同じルームを開き、片方で再生/停止するともう片方も動くこと。

---

## Phase 2: チャットの追加（所要目安: 1日）

**ゴール**: 同じルーム内でテキストメッセージがリアルタイムで表示される。

1. **Socket イベントの追加**
   - `chat:message` … 送信: `{ userId, userName, text }`
   - サーバーは受け取ったらそのまま `chat:message` で全員にブロードキャスト（1ルーム固定なら全員に送ればよい）。

2. **UI**
   - 画面レイアウトは「上: 参加者アイコン / 中: 左チャット・右プレイヤー / 下: 入力欄」でよい。
   - チャットエリア: メッセージをリスト表示。新着は下に追加し、スクロールで過去を表示。
   - 入力欄: テキスト入力 + 送信ボタン。送信時に `chat:message` を emit。ユーザー名は MVP では固定（例: User1）や、入室時に1回だけ入力してもらう形でよい。

3. **メッセージの保持**
   - MVP では **メモリ上のみ**（サーバー再起動で消える）でよい。配列に push して、新規参加者には `chat:history` で過去数十分を返す程度で可。
   - または「履歴は持たず、入室後のメッセージだけ見える」でも可。

**チェック**: 2つのブラウザでメッセージを送り合い、両方に即時表示されること。

---

## Phase 3: AI 短い解説の組み込み（所要目安: 1〜2日）

**ゴール**: 新しい YouTube URL（曲）が流れたときだけ、AI が短い解説（140〜240文字）を生成し、チャットまたは「Now Playing」欄に表示する。

1. **Gemini API の呼び出し**
   - サーバー側（Node）で `@google/generative-ai` を使い、`videoId` または「曲名・アーティスト」（後述）を渡して解説文を生成する API を用意。
   - プロンプト例: 「この曲について、洋楽ファン向けに140〜240文字で豆知識を1つ書いてください。専門用語は少なめに。」

2. **曲情報の取得**
   - **MVP**: YouTube URL から `videoId` のみ取得。タイトル取得には YouTube Data API v3 の動画情報が使えるが、API キーとクォータが必要。
   - **簡易案**: いったん `videoId` だけ Gemini に渡さず、**ユーザーが URL を貼った直後のメッセージ**（またはタイトル欄）から「アーティスト名・曲名」を抽出して Gemini に渡す。あるいは、貼った人に「曲名を教えて」と表示し、1行入力してもらう。
   - もう一つの簡易案: **oEmbed** でタイトルを取得（`https://www.youtube.com/oembed?url=...`）し、そのタイトルを Gemini に渡して解説生成。

3. **トリガー**
   - Socket で `changeVideo(videoId)` が飛んだとき、サーバー側で:
     1. 曲名を取得（oEmbed またはユーザー入力）
     2. Gemini で解説を生成
     3. 生成したテキストを **AI の発言**として `chat:message` で流す（例: `userName: "AI"`）。

4. **表示**
   - チャットに「AI: （解説文）」として出る形でよい。右側の「Now Playing + 解説」は、同じテキストを右ペインにも表示するだけにして、レイアウトは後から整える。

5. **コスト・レート制限**
   - 曲が変わるたびに1回だけ呼ぶので、Gemini の無料枠で十分回る想定。連打対策として、同じ `videoId` では 5分以内は再生成しないなどのキャッシュを入れると安全。

**チェック**: URL を貼って動画が切り替わったあと、数十秒以内に AI の短い解説がチャット（または右ペイン）に表示されること。

---

## Phase 4: 画面レイアウト・UX の整理（所要目安: 0.5〜1日）

**ゴール**: プラン通りの「上: 参加者 / 中: 左チャット・右プレイヤー / 下: 入力欄」に整える。

1. **参加者バー（上）**
   - とりあえず「接続中の Socket ID またはニックネーム」をアイコン代わりに横並びで表示。AI は固定で1つ表示（常に在席のようにする）。

2. **左: チャット**
   - 既存のチャット表示を左側に寄せ、スクロール可能に。

3. **右: プレイヤー + Now Playing**
   - 上: YouTube プレイヤー（16:9）
   - 下: 現在の曲タイトル + AI 解説（同じ140〜240文字を表示）。

4. **下: 入力欄**
   - 全幅の入力欄。テキストと「YouTube URL を貼ると曲が変わる」ことをプレースホルダーで案内。

5. **ダークモード**
   - Tailwind で `dark` を基調にしたクラスを適用し、音楽向けの落ち着いた色に。

**チェック**: 1画面で「参加者・チャット・プレイヤー・解説・入力」がすべて確認できること。

---

## Phase 5: デプロイ・動作確認（所要目安: 0.5日）

1. **フロント（Next.js）**
   - Vercel にデプロイ: `vercel` または GitHub 連携で push するとビルド・公開。

2. **Socket サーバー**
   - Socket.io を別プロセスで動かしている場合、**Vercel では動かせない**ため、別ホストが必要。
   - 例: Railway / Render / Fly.io などで Node サーバーを1つデプロイし、その URL をフロントの Socket クライアントの接続先にする。
   - または、**Ably** に切り替えれば Vercel のみで完結できる（Ably はクライアント同士のメッセージ中継になる）。

3. **環境変数**
   - Vercel: `NEXT_PUBLIC_SOCKET_URL`（または Ably キー）、サーバー側: `GEMINI_API_KEY` を本番用に設定。

4. **動作確認**
   - 2台の端末（またはシークレット窓）で同じ URL を開き、同期再生・チャット・URL 貼付→AI 解説まで一通り確認。

---

## ディレクトリ構成の例（MVP 時点）

```
e:\mc\
├── app/
│   ├── layout.tsx
│   ├── page.tsx          # 1ルーム画面（固定）
│   └── globals.css
├── src/
│   ├── components/
│   │   ├── YouTubePlayer.tsx
│   │   ├── Chat.tsx
│   │   ├── ChatInput.tsx
│   │   ├── NowPlaying.tsx
│   │   └── UserBar.tsx
│   ├── lib/
│   │   ├── socket.ts      # クライアント Socket 接続
│   │   └── youtube.ts     # videoId 抽出など
│   └── hooks/
│       └── useSocket.ts
├── server/                # Socket.io サーバー（別プロセス）
│   ├── index.js
│   └── package.json
├── .env.local
├── docs/
│   └── 構築手順_MVPプロトタイプ.md  # 本ファイル
└── package.json
```

---

## マイルストーン一覧

| # | マイルストーン | 完了条件 |
|---|----------------|----------|
| M1 | 環境準備 | `npm run dev` で Next が立ち上がり、Socket サーバーも起動できる |
| M2 | 同期再生 | 2クライアントで再生・停止・シークが一致する |
| M3 | チャット | 2クライアントでメッセージが即時表示される |
| M4 | AI 解説 | URL 貼付→曲切り替え後に AI の短い解説が1つ表示される |
| M5 | レイアウト | 上/中左/中右/下の配置がプラン通りになっている |
| M6 | デプロイ | 本番 URL で同じ動作が再現できる |

---

## 注意事項

- **YouTube 規約**: 埋め込みは IFrame のまま。音声だけ抜く・広告ブロックは行わない。
- **Gemini**: 同じ曲での連打を防ぐため、`videoId` 単位で短時間キャッシュする。
- **認証**: MVP では未実装でよい。ニックネームは入力または「Guest-xxxx」で可。

ここまでできれば「1ルーム・1動画の同期再生＋チャット＋AI の短い解説だけ」のプロトタイプは完成です。その後、曲キュー・履歴永続化・Music8 連携などを段階的に追加していくことを推奨します。
