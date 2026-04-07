# マイリスト用・アーティスト参照テーブル（正規化）

`docs/my-list-spec.md` の **「アーティストの保存形態（現状と目標）」** に合わせ、**保存済みアーティストを DB 行として持ち、マイリスト曲から参照する**ためのテーブルです。

**第1段階の `user_my_list_items.artist`（テキスト）はそのまま残せる**（移行・二重運用・フォールバック用）。API／アプリで紐づけを書き始めたら本テーブルを利用する。

## Supabase に追加するテーブル（2 つ）

| テーブル | 役割 |
|----------|------|
| **`user_my_library_artists`** | ユーザーごとの **アーティストマスタ**（1 人＝原則 1 行。表示名の正など） |
| **`user_my_list_item_artists`** | **マイリスト 1 曲（1 行）とアーティストの多対多**（メイン／2 人目の順序は `position`） |

## 作成手順

1. 先に **`docs/supabase-user-my-list-table.md`** の `user_my_list_items` を作成済みであること。
2. Supabase **SQL Editor** で以下を実行。

```sql
-- 1) ユーザー別ライブラリ・アーティスト（参照のマスタ）
create table if not exists public.user_my_library_artists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  artist_slug text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, display_name)
);

create index if not exists idx_user_my_library_artists_user
  on public.user_my_library_artists (user_id);

create unique index if not exists uq_user_my_library_artists_user_slug
  on public.user_my_library_artists (user_id, artist_slug)
  where artist_slug is not null and artist_slug <> '';

comment on table public.user_my_library_artists is 'マイリスト等で参照するユーザー単位のアーティスト行';

-- 2) マイリスト曲 ↔ アーティスト（多対多）
create table if not exists public.user_my_list_item_artists (
  my_list_item_id uuid not null references public.user_my_list_items(id) on delete cascade,
  artist_id uuid not null references public.user_my_library_artists(id) on delete cascade,
  position smallint not null default 0,
  primary key (my_list_item_id, artist_id)
);

create index if not exists idx_my_list_item_artists_artist
  on public.user_my_list_item_artists (artist_id);

comment on table public.user_my_list_item_artists is 'マイリスト1曲に紐づくアーティスト（複数可）。position 昇順が表示順';

-- RLS: アーティストマスタ
alter table public.user_my_library_artists enable row level security;

create policy "Users can insert own library artists"
  on public.user_my_library_artists for insert
  with check (auth.uid() = user_id);

create policy "Users can select own library artists"
  on public.user_my_library_artists for select
  using (auth.uid() = user_id);

create policy "Users can update own library artists"
  on public.user_my_library_artists for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own library artists"
  on public.user_my_library_artists for delete
  using (auth.uid() = user_id);

-- RLS: 紐づけ（自分のマイリスト行かつ自分のアーティストのみ）
alter table public.user_my_list_item_artists enable row level security;

create policy "Users can select own my list item artists"
  on public.user_my_list_item_artists for select
  using (
    exists (
      select 1 from public.user_my_list_items i
      where i.id = my_list_item_id and i.user_id = auth.uid()
    )
  );

create policy "Users can insert own my list item artists"
  on public.user_my_list_item_artists for insert
  with check (
    exists (
      select 1 from public.user_my_list_items i
      where i.id = my_list_item_id and i.user_id = auth.uid()
    )
    and exists (
      select 1 from public.user_my_library_artists a
      where a.id = artist_id and a.user_id = auth.uid()
    )
  );

create policy "Users can delete own my list item artists"
  on public.user_my_list_item_artists for delete
  using (
    exists (
      select 1 from public.user_my_list_items i
      where i.id = my_list_item_id and i.user_id = auth.uid()
    )
  );
```

## 補足

- **`unique (user_id, display_name)`** は表記が完全一致するときのみ重複防止。名寄せ（`The Police` と `Police`）はアプリ側または将来 `normalized_name` 列・別索引で拡張する。
- **`artist_slug`** は Music8 JSON 参照用（例: `the police` → `police`）。アプリ同期では表示名から英数字ハイフン形式へ自動生成し、`unique(user_id, artist_slug)`（部分ユニーク）で衝突を避ける。
- **`position`**: `0` をメイン、`1, 2, …` を 2 人目以降にすると UI と一致しやすい。
- アーティスト行を削除すると **`on delete cascade`** で紐づけも消える。マスタ削除は慎重にするか、先に `user_my_list_item_artists` だけ消す運用でもよい。
- **アプリ実装**: `POST` / `PATCH` `src/app/api/my-list/route.ts` 成功後に `syncMyListItemLibraryArtists`（`src/lib/my-list-sync-library-artists.ts`）が走り、`user_my_list_items.artist` を `,\s+` で分割してマスタ upsert＋紐づけを更新する。テーブル未作成時はログのみでスキップ。

## 関連

- マイリスト本体: `docs/supabase-user-my-list-table.md`
- 企画: `docs/my-list-spec.md`
- 項目一覧: `docs/recorded-data-fields.md`
