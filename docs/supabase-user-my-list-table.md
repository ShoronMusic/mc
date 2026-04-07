# マイリストテーブル（ユーザー個人のライブラリ）

YouTube 動画をユーザーごとに保存します。チャット参加とは独立した**自分のライブラリ**用です。同一ユーザー・同一 `video_id` は 1 行のみです。

## 作成手順

1. Supabase ダッシュボードで **SQL Editor** を開く。
2. 次の SQL を実行する。

```sql
-- ユーザーマイリスト（ライブラリ。同じ video_id は1ユーザーあたり1件）
create table if not exists public.user_my_list_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  video_id text not null,
  url text not null,
  title text,
  artist text,
  -- 第1段階必須: 「曲名」「アーティスト」の永続化（アプリで編集・保存。null 許容は運用で避ける）
  note text,
  source text not null default 'manual_url',
  music8_song_id integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, video_id)
);

create index if not exists idx_user_my_list_items_user_created
  on public.user_my_list_items (user_id, created_at desc);

alter table public.user_my_list_items enable row level security;

create policy "Users can insert own my list items"
  on public.user_my_list_items for insert
  with check (auth.uid() = user_id);

create policy "Users can select own my list items"
  on public.user_my_list_items for select
  using (auth.uid() = user_id);

create policy "Users can update own my list items"
  on public.user_my_list_items for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own my list items"
  on public.user_my_list_items for delete
  using (auth.uid() = user_id);
```

## `source` の例

| 値 | 意味 |
|----|------|
| `manual_url` | マイページなどから URL／ID で追加 |
| `song_history` | 貼った曲履歴から追加 |
| `favorites` | お気に入りから追加 |
| `extension` | Chrome 拡張から追加（将来） |
| `import` | インポート等 |

## 関連

- 企画: `docs/my-list-spec.md`
- API: `GET` / `POST` / `PATCH` / `DELETE` → `src/app/api/my-list/route.ts`
- **アーティスト参照（正規化・追加テーブル）**: `docs/supabase-user-my-library-artists-tables.md`
