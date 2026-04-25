# AIキャラ選曲ログテーブル（管理画面用）

AIキャラ（ちょっとえ等）が **YouTube まで解決した選曲** のたびに 1 行記録し、`/admin/ai-character-song-picks` で集計・一覧表示します。  
`/api/ai/character-song-pick` が成功し `youtube.ok === true` のときのみ INSERT されます。

## SQL（Supabase SQL Editor で実行）

```sql
create table if not exists public.ai_character_song_pick_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  room_id text,
  room_title text,
  picked_video_id text,
  picked_artist_title text,
  picked_youtube_title text,
  pick_query text,
  pick_reason text,
  confirmation_text text,
  input_comment text
);

create index if not exists idx_ai_character_song_pick_logs_created
  on public.ai_character_song_pick_logs (created_at desc);

create index if not exists idx_ai_character_song_pick_logs_room_created
  on public.ai_character_song_pick_logs (room_id, created_at desc);

-- クライアントからは読まない（管理 API が service_role で読む）
alter table public.ai_character_song_pick_logs enable row level security;

-- ポリシーなし = anon からはアクセス不可（service_role のみ）
```

## 保存の条件

- `.env.local` に **`SUPABASE_SERVICE_ROLE_KEY`** があるとき INSERT されます。
- `AI_CHARACTER_SONG_PICK_LOG_PERSIST=0` のときは DB 保存を止められます。

## 主な列

| 列 | 内容 |
|----|------|
| `room_id` | 部屋 ID（ルートの `[roomId]`） |
| `room_title` | 部屋の表示名（クライアントから送る場合） |
| `picked_video_id` | 選ばれた YouTube の videoId |
| `picked_artist_title` | アプリ整形の「Artist - Title」相当 |
| `picked_youtube_title` | YouTube の動画タイトル原文 |
| `pick_query` | AI が出した検索クエリ |
| `pick_reason` | AI が出した選曲理由（短文） |
| `confirmation_text` | 確認表示用の「Artist - Title」 |
| `input_comment` | **AIキャラが当該選曲についてチャットに出した本文**（「この1曲です」＋URL、および曲解説後の短い紹介などを結合。INSERT 直後は空で、クライアントが `POST /api/ai/character-song-pick-utterance` で追記） |

## 管理画面

- **一覧**: `/admin/ai-character-song-picks`
- **API**: `GET /api/admin/ai-character-song-picks`（`STYLE_ADMIN_USER_IDS` + ログイン + service role）

## 選曲コメントの追記

ルームクライアントが選曲確定後にチャットへ出した AI キャラ文を、`POST /api/ai/character-song-pick-utterance`（認証不要・IP レート制限）で `input_comment` に UPDATE します。`pickLogId` は `/api/ai/character-song-pick` の JSON に含まれます。
