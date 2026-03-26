# チャットで貼る YouTube URL から得られる曲情報

曲は YouTube の URL で貼られる。そこから取得できる情報を整理する。

---

## 1. URL から直接わかること

- **videoId（動画ID）** だけが一意に決まる。
- 形式例: `https://www.youtube.com/watch?v=xxxxx` → `v=` の後の **11文字** が videoId。
- 短縮URL `https://youtu.be/xxxxx` も同様に videoId に変換可能。

→ **曲名・アーティスト名などは URL だけでは一切取れない。**

---

## 2. oEmbed（APIキー不要・無料）

`https://www.youtube.com/oembed?url=貼られたURL&format=json` に GET すると、次のような情報が返る。

| 項目 | 例・説明 |
|------|----------|
| **title** | 動画タイトル（多くの場合「アーティスト名 - 曲名」や曲名） |
| **author_name** | チャンネル名（アーティスト名やレーベル名のことが多い） |
| **author_url** | チャンネルのURL |
| **thumbnail_url** | サムネイル画像URL（通常は 480x360 など） |
| **width / height** | 推奨埋め込みサイズ |

- **メリット**: 認証不要・クォータ制限がほぼない・実装が簡単。
- **限界**: 曲名とアーティストを**分離した項目はない**。タイトルとチャンネル名から推測する必要がある。

---

## 3. YouTube Data API v3（APIキー必要・クォータあり）

`videos.list` で `videoId` を指定すると、次のようなメタデータが取れる。

| 項目 | 説明 |
|------|------|
| **snippet.title** | 動画タイトル |
| **snippet.description** | 説明文（曲名・アーティストが書いてあることが多い） |
| **snippet.channelTitle** | チャンネル名 |
| **snippet.publishedAt** | 公開日時 |
| **snippet.tags** | タグ（曲名・アーティストが含まれることがある） |
| **snippet.thumbnails** | 各種サイズのサムネイルURL |
| **contentDetails.duration** | 再生時間（ISO 8601、例: PT3M45S → 3分45秒） |
| **statistics.viewCount** | 再生回数（任意） |

- **メリット**: タイトル・説明・タグ・長さなどが揃う。AI の解説や「曲情報」の補強に使える。
- **デメリット**: API キーが必要。1リクエストあたりクォータを消費する（1 video 取得 = 1 単位など）。日次クォータを超えると使えなくなる。

---

## 4. まとめ：どこまでを「曲情報」として使うか

| 取得方法 | 得られる曲まわり情報 | コスト |
|----------|----------------------|--------|
| **URL のみ** | videoId のみ | なし |
| **oEmbed** | タイトル、チャンネル名、サムネイル | APIキー不要・無料 |
| **Data API v3** | 上記 ＋ 説明・タグ・長さ・公開日など | APIキー・クォータ消費 |

- **MVP では oEmbed で十分**なことが多い。  
  - 保存する「曲情報」の例: `youtube_video_id`, `youtube_title`（oEmbed の title）, `channel_name`（oEmbed の author_name）, `thumbnail_url`。
- **アーティスト名・曲名を分けたい場合**は、  
  - oEmbed の `title` を「アーティスト - 曲名」としてパースする、  
  - または Data API の `snippet.title` / `description` / `tags` を AI（Gemini）に渡して「artist_name / track_title」を抽出する、  
  といった運用が現実的。

---

## 5. DB との対応（session_songs の例）

URL から「曲情報」をどこまで入れるかの例。

| カラム | 主な取得元 |
|--------|------------|
| youtube_video_id | URL から抽出（必須） |
| youtube_title | oEmbed `title` または Data API `snippet.title` |
| channel_name | oEmbed `author_name` または Data API `snippet.channelTitle` |
| thumbnail_url | oEmbed `thumbnail_url` または Data API `snippet.thumbnails` |
| duration_seconds | Data API `contentDetails.duration` を秒に変換（任意） |
| artist_name | タイトルからのパース or AI 抽出（任意） |
| track_title | 同上（任意） |

「チャットで曲を貼ったとき」は、最低限 **videoId + oEmbed の title / author_name / thumbnail** を取っておけば、一覧・振り返り・AI 解説の入力として使える。
