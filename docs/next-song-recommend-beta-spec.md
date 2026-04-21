# 「次に聴くなら」試験機能（Gemini）仕様

## 1. 目的

曲解説（comment-pack / commentary）表示後に、**いま聴いている曲に続けて聴きそうな洋楽**を 1〜3 本、AI が短文で提案する。**試験段階**のため、サーバー環境変数で全体 ON/OFF し、任意で **β 利用者（UID）に限定**できる。

## 2. ユーザー体験

- 曲解説が出たあと、**数秒〜十数秒後**にだけ API が走り、条件を満たせば AI 発言として  
  `【次に聴くなら（試験）】` で始まるブロックが **選曲したクライアントの画面にのみ**表示される（既存の曲解説・三択クイズと同様、選曲者が fetch する）。
- 各行: 曲順番号・アーティスト「曲名」・一言理由・**YouTube 検索用クエリ**（ユーザーがキーワード検索 UI で使える想定）。**動画 URL は返さない**（ハルシネーション防止）。

## 3. 環境変数（サーバーのみ）

| 変数 | 必須 | 意味 |
|------|------|------|
| `NEXT_SONG_RECOMMEND_ENABLED` | 試験で ON にするとき | `1` のとき機能のマスター ON。未設定・その他は OFF。 |
| `NEXT_SONG_RECOMMEND_BETA_USER_IDS` | 任意 | Supabase Auth の **ユーザー UUID** をカンマ区切り。**1 件以上あるとき**、その UID に一致するログインユーザーだけが API で提案を取得できる。**空または未設定**のときは、マスター ON なら **全ログインユーザー**対象。 |
| `NEXT_SONG_RECOMMEND_RATE_PER_MINUTE` | 任意 | **ユーザー ID 単位**のレート上限（60 秒窓）。未設定時は **8**。1〜60 の整数のみ有効。 |
| `NEXT_SONG_RECOMMEND_DEBUG_LOG` | 任意 | `1` / `true` で、提案時の根拠デバッグ JSON（`whyTags`・`eraFit`・`popularityFit` など）をサーバーログへ 1 行出力。 |

運用者はホスティング（例: Vercel）の環境変数を変更してデプロイ／再起動により切り替える。

## 4. API

### `POST /api/ai/next-song-recommend`

- **認証**: Cookie セッション。ゲストは `enabled: false`（200）。
- **ボディ（JSON）**  
  - `videoId`（必須）: 再生中の YouTube 動画 ID。  
  - `roomId`（任意）: 利用ログ用。  
  - `commentarySnippet`（任意）: 曲解説の冒頭など最大 2000 文字。プロンプトの補助。
- **レスポンス**  
  - 常に **200** を基本とする（クライアントが静かにスキップしやすい）。  
  - `enabled: false` … マスター OFF、β 対象外、ゲスト、レート超過、Gemini 未設定・失敗時など。  
  - `enabled: true` かつ `picks: NextSongPick[]` … 1〜3 件。  
- **NextSongPick**  
  - `artist`（string）  
  - `title`（string）  
  - `reason`（string）  
  - `youtubeSearchQuery`（string）… 公式 MV / オーディオを探しやすい短い英語または日英混在可。

## 5. サーバー処理概要

1. セッションから `user.id` を取得。ゲスト → `{ enabled: false }`。  
2. `NEXT_SONG_RECOMMEND_ENABLED !== '1'` → `{ enabled: false }`。  
3. `NEXT_SONG_RECOMMEND_BETA_USER_IDS` が非空なら、UID が含まれるか判定。含まれなければ `{ enabled: false }`。  
4. ユーザー単位レート制限。超過時は `{ enabled: false, reason: 'rate_limited' }`（ログ用。UI は無表示）。  
5. `videoId` から oEmbed / Data API でタイトル等を取得し、既存の `resolveArtistSongForPackAsync` で **いまの曲の表示ラベル**を組み立て。  
6. ログイン時は `fetchUserTasteContextForChat` で趣向テキストを取得（任意・長さ上限は既存どおり）。  
7. Gemini（usage コンテキスト名: `next_song_recommend`）で JSON のみの配列を生成。  
8. `gemini_usage_logs` へは既存の `persistGeminiUsageLog` と同じキーで記録。
9. `NEXT_SONG_RECOMMEND_DEBUG_LOG=1` のとき、`t=next_song_recommend_debug` の JSON ログを出力（内部推論全文ではなく、モデル出力した根拠タグと入力条件の要約）。

## 6. クライアント

- **ゲスト**ではリクエストを送らない。  
- 曲解説が表示された **同一フロー**で、三択クイズより **後から**発火するよう遅延を多めに取り、Gemini の同時多発を避ける（遅延値は `schedule-next-song-recommend-client.ts` にコメント）。  
- `RoomWithSync` / `RoomWithoutSync` の両方で、曲解説成功パスにフック。

## 7. 既知の制限（試験版）

- 提案の事実正確性はモデル依存。**URL は付けない**。  
- 推薦方針（2026-04 版）  
  - **ヒット度の近さを優先**: 入力曲がメジャーヒットなら、候補も世間的スケールが近い曲を優先。  
  - **入力がマニアックな場合は緩和**: 知名度の一致より、音色・リズム・空気感などテイスト一致を優先。  
  - **時代の近さを優先**: まず前後 5 年を優先し、近い候補が不足する場合のみ範囲外を許容。  
- 邦楽節約・曲解説スキップと**独立**（試験用にシンプルに保つ）。必要なら将来ジョインする。  
- 管理画面の集計セットに `next_song_recommend` を含める（`/admin` の Gemini 系集計用）。

## 8. 関連ファイル

| 種別 | パス |
|------|------|
| 仕様 | 本書 |
| フラグ判定 | `src/lib/next-song-recommend-feature.ts` |
| レート制限 | `src/lib/next-song-recommend-rate-limit.ts` |
| Gemini 生成 | `src/lib/next-song-recommend-generate.ts` |
| API | `src/app/api/ai/next-song-recommend/route.ts` |
| クライアント遅延実行 | `src/lib/schedule-next-song-recommend-client.ts` |
| 部屋 UI | `RoomWithSync.tsx` / `RoomWithoutSync.tsx` |

## 9. DB 追加（今回必要）

`next_song_recommendations` テーブルを追加する。`comment_feedback` は既存を再利用（`source='next_song_recommend'`、`ai_message_id=next_song_recommendations.id`）。

```sql
create table if not exists public.next_song_recommendations (
  id uuid primary key default gen_random_uuid(),
  seed_song_id uuid null references public.songs(id) on delete set null,
  seed_video_id text not null,
  seed_label text not null,
  recommended_artist text not null,
  recommended_title text not null,
  reason text not null,
  youtube_search_query text not null,
  order_index int not null default 1,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_next_song_recommendations_seed_video_active
  on public.next_song_recommendations(seed_video_id, is_active, created_at desc);
```
