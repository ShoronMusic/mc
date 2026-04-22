# Gemini 利用ログテーブル（管理画面用）

各 Gemini 呼び出しのトークン数を蓄積し、`/admin/gemini-usage` で集計・一覧表示します。

## SQL（Supabase SQL Editor で実行）

```sql
create table if not exists public.gemini_usage_logs (
  id uuid primary key default gen_random_uuid(),
  context text not null,
  model text not null default 'gemini-2.5-flash',
  prompt_token_count integer,
  output_token_count integer,
  total_token_count integer,
  cached_token_count integer,
  room_id text,
  video_id text,
  created_at timestamptz not null default now()
);

create index if not exists idx_gemini_usage_logs_created
  on public.gemini_usage_logs (created_at desc);

create index if not exists idx_gemini_usage_logs_context
  on public.gemini_usage_logs (context);

-- クライアントからは読まない（API が service_role で読む）
alter table public.gemini_usage_logs enable row level security;

-- ポリシーなし = anon からはアクセス不可（service_role のみ）
```

## 保存の条件

- `.env.local` に **`SUPABASE_SERVICE_ROLE_KEY`** があるとき、各 API 呼び出し後に 1 行 INSERT されます。
- `GEMINI_USAGE_PERSIST=0` のときは DB 保存を止められます（コンソールログのみのときと同様）。

## context（種別）の意味

| context | 用途 |
|---------|------|
| `chat_reply` | チャットへの AI 返答 |
| `tidbit` | 30秒無発言の豆知識 |
| `commentary` | 曲解説（[NEW]/[DB] の基本コメント） |
| `get_song_style` | 曲スタイル分類 |
| `extract_song_search` | 「曲を貼って」系のクエリ抽出 |
| `comment_pack_base` | comment-pack API の基本コメント |
| `comment_pack_free_1`〜`3` | comment-pack の自由コメント |
| `theme_playlist_comment` | マイページ「お題プレイリスト」1曲あたりの短い AI コメント |

**料金の目安**: 公式料金ページの **入力トークン単価 × prompt_token_count 合計**、**出力単価 × output_token_count 合計** で概算できます。
