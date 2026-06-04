# PWA — スマホ実機での見え方・動作確認

改修後に **スマホの見た目・触り心地** を確認する手順。PC の `localhost:3002` だけでは足りない箇所向け。

**索引**: `docs/00-pwa-mobile-app.md`

---

## 1. 確認方法の選び方

| 方法 | URL 例 | 向いていること |
|------|--------|----------------|
| **LAN（ローカル dev）** | `http://192.168.x.x:3002` | UI 改修の即確認 |
| **Vercel プレビュー** | `https://….vercel.app` | OAuth・HTTPS・本番ビルドに近い確認 |
| **本番** | 本番ドメイン | PWA インストール後の最終確認 |
| **Chrome デバイスモード（PC）** | `localhost:3002` | 幅・lg 未満レイアウトの目安のみ |

**特別な開発環境は不要**。`npm run dev` / `npm run dev:lan` と実機ブラウザで足りる。

---

## 2. ローカル dev をスマホから見る

### 2.1 起動

```powershell
cd E:\mc
npm run dev:lan
```

（`next dev -p 3002 -H 0.0.0.0` — 同一 Wi‑Fi 内の端末から接続可能）

### 2.2 PC の IP

```powershell
ipconfig
```

例: `192.168.1.23` → スマホで **`http://192.168.1.23:3002`**

### 2.3 注意

- **PC では `http://localhost:3002` を開く**（ターミナルに出る `Network: http://0.0.0.0:3002` をブラウザで開くと、**CSS が当たらず UI が崩れる**ことがある）
- スマホだけ **`http://<PCのIPv4>:3002`**
- PC とスマホは **同じ Wi‑Fi**
- Windows ファイアウォールで **3002 を許可**
- **Google ログイン**は Supabase の Redirect URLs に LAN の callback を追加しないと失敗しうる → ログイン確認は **Vercel プレビュー or 本番** 推奨
- **PWA のホーム画面追加**の最終確認は **HTTPS の本番 or プレビュー**

### 2.4 UI が真っ白・ボタンだけ巨大（スタイル未適用）のとき

1. アドレスが **`0.0.0.0` ではないか** → `http://localhost:3002` に変える
2. 直らなければ dev を止め、`Remove-Item -Recurse -Force .next` のあと `npm run dev` で再起動
3. ブラウザのハードリロード（Ctrl+Shift+R）

### 2.5 `missing required error components, refreshing...` のとき

Next の **コンパイルエラー**（ソース破損・構文エラー）で dev が壊れた状態。ターミナルに赤い `Failed to compile` が出ていないか確認。

1. dev を **Ctrl+C** で止める
2. `Remove-Item -Recurse -Force .next`
3. `npm run dev` または `npm run dev:lan` で再起動
4. まだ出る場合はターミナルの最初のエラー行を確認（例: `src/app/api/.../route.ts` の Syntax Error）

---

## 3. 改修後チェックリスト（目安）

大きく UI を触ったとき。5〜10 分。

| # | 項目 | 確認内容 |
|---|------|----------|
| 1 | トップ / 入室 | ボタンが押せる、はみ出し・横スクロール異常なし |
| 2 | 部屋（同期） | 動画・チャット・送信欄が縦画面に収まる |
| 3 | 送信欄 | キーボード表示時も送信ボタンが届く |
| 4 | 選曲 | URL 貼り付け or ライブラリモーダル（3 段 UI） |
| 5 | モーダル | 下の safe-area（ホームインジケータ）に被らない |
| 6 | 参加者 | チップの横スクロール |
| 7 | PWA | ホーム画面から起動し、1〜6 が standalone でも同様 |
| 8 | 部屋スクロール | チャットを上下に素早くフリックしても **ページ全体が再読み込みされず**、再生が続く |
| 9 | YouTube 共有（Android PWA） | YouTube → 共有 → 洋楽AIチャット → **直近の部屋**で発言欄に `watch?v=` が入る（送信は手動） |

### 3.1 スクロールでページが再読み込みされる（プルリフレッシュ）

スマホ/PWA で部屋を見ているとき、チャットの縦スクロールが親に伝わると **プルリフレッシュ** や **バウンス** で全体がリロードし、YouTube 再生が止まることがある。

**対策（実装済み）**: 部屋マウント時に `usePreventRoomPullToRefresh` が `html` にクラスを付与。**ホーム画面**は `mc-prevent-pull-refresh`（document 固定）、**スマホブラウザのタブ**は `mc-prevent-pull-refresh-lite`（overscroll のみ・ヘッダーがアドレスバーに隠れない）。チャット一覧は `mc-room-scroll-pane`。

**確認**: ホーム画面から開き、部屋でチャットを上端まで引っ張ってもリロードしないこと。**ブラウザのタブ**から開き、部屋ヘッダーがアドレスバーに隠れず、必要ならページを上方向にスクロールできること。

---

## 4. 日々の運用イメージ

```
小さな CSS・文言
  → PC localhost:3002
  → 必要なら Chrome デバイスモード

部屋・モーダル・入力
  → npm run dev:lan → スマホで LAN IP

ログイン・PWA インストール・YouTube 共有
  → git push → Vercel プレビュー URL をスマホで開く（共有受け口は HTTPS 必須）
```

---

## 5. 関連

- 方針・Phase: `docs/pwa-mobile-app-plan.md`
- YouTube 共有受け口: `docs/pwa-phase2-youtube-share-receive.md`
- ローカルポート: `docs/ローカル並行開発.md`（3002）
- スマホ選曲ガイド: `/guide/first-song-mobile`

---

*最終更新: 2026-05-28*
