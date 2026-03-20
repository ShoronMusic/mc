# 曲単独DB（曲を単位にした設計）についての意見

## 提案の整理

- **単位**: 「曲」＝ メインアーティスト - 曲名 を一つの実体とする
- **1曲に複数 video_id**: オフィシャルPV・リリックPV・ライブ・Topic などはすべて「その曲のバージョン」として紐づく
- **曲に紐づけて保持するもの**: 基本情報（曲解説）、AI が語った豆知識
- **video_id 単位では多すぎる**: 同じ曲の別バージョンごとに基本情報・豆知識が増えず、一つの曲に集約できる
- **追加したいデータ**: 視聴回数、視聴履歴（視聴日時・参加人数など）→ チャットサービスとして有効な分析ができる

---

## 意見：その考え方でよいと思う

### 賛成する理由

1. **ユーザーの頭の中は「曲」**
   - 「Madonna - Hung Up」は1曲であり、オフィシャルPVかリリックかは「どの動画で見たか」の違いでしかない。
   - 基本情報・豆知識は曲に1つあれば十分で、video_id ごとに持つと重複が多くなる。

2. **集約できると価値が上がる**
   - 曲解説・豆知識を曲単位で1本にまとめられる。
   - 「この曲が何回流れたか」「どのルームでよく流れているか」など、曲ベースの分析がしやすくなる。

3. **視聴回数・視聴履歴はサービス品質に直結する**
   - 人気曲ランキング、ルームごとの傾向、参加人数と視聴数の関係など、チャットサービスとしての改善やコンテンツ提案に使える。

4. **既存の「video_id 単位」との役割分担**
   - **曲（song）**: 正規化された「メインアーティスト - 曲名」、基本情報、豆知識、集計用の視聴回数など。
   - **video_id**: 「その曲のどのバージョン（PV種別など）を再生したか」の事実。視聴履歴の明細は video_id 付きで持つと、後から「オフィシャルだけ集計」などもできる。

---

## スキーマ案（イメージ）

```
■ songs（曲マスタ）
  - id (uuid)
  - artist_name (text)      -- メインアーティスト
  - song_title (text)       -- 曲名
  - display_title (text)    -- 表示用「アーティスト - 曲名」（正規化済み）
  - created_at, updated_at

■ song_videos（曲と動画の対応）
  - song_id (FK → songs)
  - video_id (text)         -- YouTube video_id
  - variant (text)          -- 任意: "official" | "lyric" | "live" | "topic" など
  - first_seen_at            -- 初めてこの video が流れた日時
  - UNIQUE(video_id)         -- 1 video は 1 曲にのみ属する

■ song_commentary（既存の曲解説を曲単位に）
  - song_id (FK → songs)    -- video_id の代わりに曲
  - body (text)
  - あるいは既存の song_commentary は video_id のままにして、
    取得時に video_id → song_id を解決して song に紐づく1件を返す

■ song_tidbits または tidbit_library の拡張
  - 豆知識も song_id で紐づける（同一曲の別 video で再利用）

■ play_events（視聴履歴・視聴回数用）
  - id
  - song_id (FK → songs)    -- どの曲が流れたか
  - video_id (text)         -- 実際に流した動画（どのバージョンか）
  - room_id
  - played_at
  - participant_count (int) -- その時点の参加人数（任意）
  - その他（display_name は room_playback_history と役割が重なるので、既存テーブルと統合するか要検討）
```

- **視聴回数**: `play_events` を `song_id` で集計すれば「曲ごとの再生回数」になる。
- **視聴履歴**: `played_at`, `room_id`, `participant_count` などで「いつ・どこで・何人で」を分析できる。

---

## 実装上のポイント

### 1. 曲の同一判定（正規化）

- 「Madonna - Hung Up」「MADONNA - Hung Up」「Madonna - Hung Up (Official Video)」を同じ曲とみなす必要がある。
- 案: `display_title` を保存前に正規化する（小文字化、括弧内の "Official Video" 等の除去、アーティスト名は `cleanAuthor` 済みを使う）。
- 初回は「この video から得た artist - title」で `songs` に 1 件 insert し、以降は正規化した title で検索して既存曲にマッチさせる。マッチしなければ新規曲とする。

### 2. 既存データとの関係

- 現在: `room_playback_history`, `tidbit_library`, `song_commentary` は video_id 中心。
- 移行: 新テーブル（songs, song_videos）を用意し、既存の video_id から「曲」を推測して `songs` と `song_videos` を埋める。既存テーブルはしばらく併用し、取得 API で「video_id → song_id 解決 → 曲単位の解説・豆知識を返す」ようにするのが現実的。

### 3. 視聴回数・参加人数

- 視聴回数: `play_events`（または room_playback_history を拡張）を曲単位で集計。
- 参加人数: 再生した時点のルーム参加者数をどこかで記録する必要がある（同期ルームなら接続数など）。既存の `room_playback_history` に `participant_count` を足すか、別の `play_events` に持つかは、既存 API との兼ね合いで決められる。

---

## まとめ

- **「曲」を単位にし、1曲に複数 video_id を紐づけ、基本情報・豆知識は曲に1本持つ**という考え方に賛成。
- そのうえで **視聴回数・視聴履歴（視聴日時・参加人数など）を曲／ルーム単位で持つ**と、チャットサービスとして使いやすいデータになる。
- 進め方としては、まず `songs` と `song_videos` を導入し、新規の「曲解説・豆知識」から曲単位で保存し始め、既存の video_id 単位データは段階的に移行する形が現実的だと思います。

この方針で詳細スキーマや API 変更案を詰めたい場合は、その前提でさらに具体化できます。
