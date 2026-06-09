# エージェントAI 音声読み上げ（Irodori-TTS）— 引き継ぎ（自宅 PC）

更新: 2026-06-09（運用メモ・無効化手順追記）  
リポジトリ: `E:\mc`（musicaichat）  
対象: **`character_chat`（エージェントAI）** の日本語読み上げ試験機能

**既定はオフ**。通常のチャット・選曲・曲解説には影響しない。有効化は `.env.local` で明示的に行う（§3.3・§13）。

---

## 1. 目的

同期部屋の **エージェントAI**（`aiSource: character_chat`）の発言を、ローカル **Irodori-TTS-Server** で合成しブラウザ再生する。

- 表示テキストはチャットのまま。読み上げ用にだけ整形する。
- 選曲コメントでは **曲名は読まない**。Music8 に日本語アーティスト名があるときだけ **「オアシスをどうぞ！」** のようにアーティスト名を読む。
- メッセージ横の **🔊 ボタン** で手動再再生（自動再生ブロック時のフォールバック）。

---

## 2. この PC のパス

| 種別 | パス | 備考 |
|------|------|------|
| mc リポジトリ | `E:\mc` | Next.js アプリ |
| Irodori-TTS-Server | `E:\Irodori-TTS-Server` | 別クローン・別プロセス |
| 参照音声（女性） | `E:\Irodori-TTS-Server\voices\agent_female.wav` | `speaker_00012` から抽出済み |
| mc `.env.local` | `E:\mc\.env.local` | TTS 有効化・URL・voice 名（**コミット禁止**） |
| TTS サーバー `.env` | `E:\Irodori-TTS-Server\.env` | GPU・PRELOAD（**mc 側ではない**） |

---

## 3. 初回セットアップ（未導入 PC）

### 3.1 Irodori-TTS-Server

```powershell
cd E:\mc
.\scripts\setup-irodori-tts-server.ps1
```

`E:\Irodori-TTS-Server\.env` に GPU 推奨:

```env
IRODORI_MODEL_DEVICE=cuda
IRODORI_CODEC_DEVICE=cuda
IRODORI_PRELOAD=true
```

### 3.2 参照音声 WAV（任意・女性声固定）

HF データセットから 1 本抽出:

```powershell
cd E:\mc
C:\Users\maeha\AppData\Local\Python\bin\python.exe scripts\download-irodori-ref-voice.py --speaker speaker_00012
```

既定出力: `E:\Irodori-TTS-Server\voices\agent_female.wav`

### 3.3 mc `.env.local`（試験時のみ追記）

```env
NEXT_PUBLIC_AI_CHARACTER_TTS_ENABLED=1
IRODORI_TTS_SERVER_URL=http://127.0.0.1:8088
IRODORI_TTS_VOICE=agent_female
```

任意:

```env
# CPU 向け速度優先（未設定は Irodori 既定 ~40 ステップで遅い）
IRODORI_TTS_NUM_STEPS=20
# IRODORI_TTS_SEED=42
# NEXT_PUBLIC_AI_CHARACTER_TTS_VOLUME=0.85
# 同期部屋で他参加者のエージェント発話も各端末で読む（未設定は投稿端末のみ）
# NEXT_PUBLIC_AI_CHARACTER_TTS_PLAY_INCOMING=1
# Next.js → Irodori 待ち（ms、既定 360000）。CPU では NUM_STEPS 短縮と併用
# AI_CHARACTER_TTS_UPSTREAM_TIMEOUT_MS=360000
```

**`.env.local` 変更後は `npm run dev` を再起動**（`IRODORI_TTS_VOICE` はサーバー専用 env）。

### 3.4 `uv`（Windows）

`python -m uv` で `No module named uv` になる場合:

```powershell
powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
```

PowerShell を開き直すか `$env:Path = "$env:USERPROFILE\.local\bin;$env:Path"`。  
`scripts/start-irodori-tts-server.ps1` は PATH の `uv` を優先する。

別 PC からコピーした `.venv` は壊れることがある。`E:\Irodori-TTS-Server` で `.venv` を削除して `uv sync --extra cu128` を再実行。

---

## 4. 毎日の起動手順

**ターミナル 1 — TTS サーバー**（起動したままにする）:

```powershell
cd E:\mc
.\scripts\start-irodori-tts-server.ps1
```

- `uv sync --extra cu128` のあと `uv run --no-sync` で起動（`uv run` 単体だと CPU 版 torch に戻ることがある）。
- 初回合成はモデル DL で数分かかることがある。

**ターミナル 2 — mc**:

```powershell
cd E:\mc
npm run dev
```

→ `http://localhost:3002` で部屋に入り、エージェントAI の発言を確認。

### 動作確認コマンド

```powershell
curl.exe http://127.0.0.1:8088/health
curl.exe http://127.0.0.1:8088/v1/audio/voices
```

`agent_female` が `voices\agent_female.wav` を指していれば OK。`health` で `loaded: true` を確認。

- **GPU 利用可**: `model_device: cuda`
- **MX250 等 sm_61**: PyTorch cu128 非対応 → `E:\Irodori-TTS-Server\.env` で `IRODORI_MODEL_DEVICE=cpu` / `IRODORI_CODEC_DEVICE=cpu`

起動スクリプトは HF キャッシュを `E:\Irodori-TTS-Server\.cache\huggingface` に設定（`%USERPROFILE%\.cache` が無い Windows 対策）。

---

## 5. アーキテクチャ（概要）

```
character_chat 投稿 (RoomWithSync)
    → addAiMessage（本文はそのまま）
    → scheduleAiCharacterTtsPlayback（クライアント）
        → POST /api/ai/character-tts（Next.js サーバー）
            → prepareAiCharacterTtsText（整形）
            → POST {IRODORI_TTS_SERVER_URL}/v1/audio/speech
        → ブラウザで Audio 再生（キュー付き）
```

- **Ably 同期**: 他端末は `NEXT_PUBLIC_AI_CHARACTER_TTS_PLAY_INCOMING=1` 時のみ受信メッセージでも再生。同一 `messageId` の二重キューは抑止。
- **音声ボタン**: `AiCharacterTtsReplayButton` → `replayAiCharacterTtsPlayback`（ユーザー操作なので即時再生）。

---

## 6. 読み上げテキスト整形（`prepareAiCharacterTtsText`）

ファイル: `src/lib/ai-character-tts-text.ts`（変更時は `src/lib/ai-character-tts-text.unit-test.ts` を更新し `npm run test`）

| 処理 | 内容 |
|------|------|
| プレフィックス除去 | `【AIキャラ】` |
| 行フィルタ | YouTube URL 行を除去 |
| 選曲 URL 案内 | `この1曲です。\n{url}` は **TTS しない**（`skipCharacterTts: true`） |
| 先頭 Artist - Title | 表示はそのまま。TTS では曲名・` - ` を読まない |
| 日本語アーティスト名あり | Music8 `artistjpname` → **`{ja}をどうぞ！` + 感想本文** |
| 日本語アーティスト名なし | **`をどうぞ！` も読まない**。感想本文のみ |
| その他 | 通常の `character_chat` は整形後全文を読む |

### 選曲コメントの例

| チャット表示 | 読み上げ（`artistjpname` = オアシス） |
|--------------|--------------------------------------|
| `Oasis - Wonderwallをどうぞ！前の曲と同じ90年代…` | `オアシスをどうぞ！前の曲と同じ90年代…` |
| 同上（日本語名なし） | `前の曲と同じ90年代…` |

日本語名は選曲コメント投稿時に `GET /api/music8/artist-by-name` で取得し、メッセージに `characterTtsArtistJa` として付与（Ably・🔊 再再生に引き継ぎ）。

---

## 7. コード一覧（リポジトリ内）

| 領域 | パス |
|------|------|
| TTS API | `src/app/api/ai/character-tts/route.ts` |
| サーバー → Irodori プロキシ | `src/lib/ai-character-tts-server.ts` |
| env・音量・voice・seed | `src/lib/ai-character-tts-config.ts` |
| 本文整形 | `src/lib/ai-character-tts-text.ts` |
| ブラウザ再生・キュー・キャッシュ | `src/lib/ai-character-tts-client.ts` |
| Music8 日本語名取得（クライアント） | `src/lib/music8-artist-ja-for-tts-client.ts` |
| Music8 `artistjpname` 抽出 | `src/lib/music8-artist-display.ts`（`getMusic8ArtistJapaneseName`） |
| エラー通知フック | `src/hooks/useAiCharacterTtsErrorNotice.ts` |
| 🔊 ボタン | `src/components/chat/AiCharacterTtsReplayButton.tsx` |
| 部屋（自動再生・選曲リード） | `src/components/room/RoomWithSync.tsx` |
| 部屋（非同期） | `src/components/room/RoomWithoutSync.tsx` |
| メッセージ型 | `src/types/chat.ts`（`characterTtsArtistJa`） |
| TTS サーバー初回セットアップ | `scripts/setup-irodori-tts-server.ps1` |
| TTS サーバー起動 | `scripts/start-irodori-tts-server.ps1` |
| 参照音声 DL | `scripts/download-irodori-ref-voice.py` |
| env テンプレ | `.env.example`（Irodori 節） |

エージェント会話プロンプト（カタカナ表記推奨）: `src/app/api/ai/character-chat/route.ts`

---

## 8. 声質について

- `IRODORI_TTS_VOICE=agent_female` は **`voices\agent_female.wav` を参照した合成**（WAV をそのまま流すわけではない）。
- 参照音声使用時、未設定なら **`IRODORI_TTS_SEED=42` 相当**をサーバー側で付与し、呼び出し間のブレを軽減。
- WAV をメディアプレイヤーで聞いた声と **完全一致しない**のは正常（ボイスクローニング＋拡散合成）。
- `voice=none` との差は Irodori に直接 POST して比較可能（本文書 §4 参照）。

---

## 9. トラブルシュート

| 症状 | 対処 |
|------|------|
| 読み上げなし | TTS サーバー起動・`curl health`・`.env.local` の `ENABLED` / `SERVER_URL` |
| `TTS サーバーに接続できません` | `IRODORI_TTS_SERVER_URL`・ファイアウォール・ポート 8088 |
| `ブラウザの自動再生がブロック` | 正常（Chrome ポリシー）。メッセージ横 🔊 をクリック |
| 声が毎回違う | `IRODORI_TTS_VOICE=agent_female`・`npm run dev` 再起動・参照 WAV の存在確認 |
| CUDA で落ちる | `E:\Irodori-TTS-Server` で `uv sync --extra cu128`、`.env` の `MODEL_DEVICE=cuda` |
| ポート競合 | 既存 Irodori プロセスを終了するか、そのまま利用 |
| mp3 失敗 | 既定 **wav** のまま（FFmpeg 不要） |
| 遅い | CPU では 1〜4 分が普通。`IRODORI_TTS_NUM_STEPS=20`・`IRODORI_PRELOAD=true` |
| `TTS server unreachable`（サーバーは起動中） | mc 側タイムアウト（旧 120s）。既定 **360s** に延長済み。CPU では `NUM_STEPS` 短縮 |
| HF `FileNotFoundError` `.cache\huggingface` | 起動スクリプトの `HF_HOME` 設定を確認。手動なら `E:\Irodori-TTS-Server\.cache\huggingface` を作成 |

システム行のエラー通知は **60 秒に 1 回まで**（`useAiCharacterTtsErrorNotice`）。

---

## 10. テスト

```powershell
cd E:\mc
node --import tsx src/lib/ai-character-tts-text.unit-test.ts
npm run validate
```

---

## 11. 自宅 PC への持ち越しチェックリスト

- [ ] `E:\mc` を pull（または変更一式をマージ）
- [ ] `E:\Irodori-TTS-Server` を clone 済みか、`setup-irodori-tts-server.ps1` を実行
- [ ] `voices\agent_female.wav` をコピー（または `download-irodori-ref-voice.py` で再生成）
- [ ] `E:\mc\.env.local` に §3.3 の 3 行（＋任意チューニング）
- [ ] `E:\Irodori-TTS-Server\.env` に CUDA / PRELOAD
- [ ] 2 ターミナルで TTS サーバー → `npm run dev`
- [ ] 部屋でエージェント挨拶・AI 選曲コメント・🔊 再再生を確認

---

## 12. 無効化（通常運用・本番）

**リポジトリ既定・Vercel 本番ともオフ。** 次を満たさない限り、チャット本文・エージェント会話・選曲は従来どおり（音声だけ動かない）。

| 層 | 挙動 |
|----|------|
| クライアント | `NEXT_PUBLIC_AI_CHARACTER_TTS_ENABLED !== '1'` → 自動再生・🔊・エラー通知フックすべて no-op |
| API | 同上 → `POST /api/ai/character-tts` は **404** |
| Irodori プロセス | 起動していなくても mc は通常動作 |

### 手順（自宅 PC で試験を止める）

1. `.env.local` から以下を **削除またはコメントアウト**:
   - `NEXT_PUBLIC_AI_CHARACTER_TTS_ENABLED=1`
   - `IRODORI_TTS_SERVER_URL=...`
   - `IRODORI_TTS_VOICE=...` 等の Irodori 関連
2. `npm run dev` を再起動
3. Irodori ターミナルは Ctrl+C で停止（任意）

Vercel では **`NEXT_PUBLIC_AI_CHARACTER_TTS_ENABLED` を設定しない**（`.env.example` もコメントアウトのまま）。

---

## 13. 運用メモ（2026-06-09 セッション）

### 性能（PC 依存）

- 合成は **CPU/GPU 性能に強く依存**。MX250 は CUDA 不可のため CPU のみ。
- 実測（CPU）: 短い文で **約 2〜4 分**／チャット表示から音声まで **約 2 分**も珍しくない。
- 短縮: `.env.local` の `IRODORI_TTS_NUM_STEPS=16〜24`。2 回目以降の 🔊 はクライアント Blob キャッシュで即時。

### Vercel 本番

- **現状のままでは不可**。理由:
  1. Irodori は Vercel 上で動かせない（常駐・大容量モデル）
  2. `IRODORI_TTS_SERVER_URL=http://127.0.0.1:8088` は Vercel から自宅 PC に届かない
  3. 合成時間が Serverless のタイムアウトを超える
- リモート化する場合: VPS／GPU クラウド／自宅 PC＋トンネル等の **別設計**が必要（VPS 契約は必須ではないが、常時起動マシンは必要）。

### コード側の安全策（2026-06-09）

- API ルートに `isAiCharacterTtsEnabled()` ガード（404）
- mc → Irodori タイムアウト既定 **360 秒**（`AI_CHARACTER_TTS_UPSTREAM_TIMEOUT_MS` で変更可）
- `scripts/start-irodori-tts-server.ps1`: `uv` PATH 優先・`HF_HOME` を InstallDir 配下に設定

---

## 14. 未着手・拡張メモ

- 過去メッセージの 🔊 は `characterTtsArtistJa` が無いと日本語アーティスト名リードなし（再投稿で付与）。
- 自動再生のユーザー操作ゲート（初回クリックで以降 autoplay 許可）は未実装。
- 本番向け: 外部 TTS ホスト・非同期合成・またはクラウド TTS API への差し替え。
