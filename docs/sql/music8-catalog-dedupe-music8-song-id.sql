-- music8_song_id 重複の確認と、任意の一意インデックス作成
-- カタログ拡張本体とは別実行。先に下の SELECT で件数を確認する。

-- 1. 重複一覧
select
  music8_song_id,
  count(*) as n,
  array_agg(id order by created_at, id) as song_ids,
  array_agg(display_title order by created_at, id) as titles
from public.songs
where music8_song_id is not null
group by music8_song_id
having count(*) > 1
order by n desc, music8_song_id;

-- 2. 問題の 48647 だけ見る
select id, display_title, main_artist, song_title, music8_song_slug, created_at
from public.songs
where music8_song_id = 48647
order by created_at, id;

-- 3. 重複 0 件後（2026-08-29 完了）
-- drop index if exists public.idx_songs_music8_song_id;
-- create unique index idx_songs_music8_song_id
--   on public.songs (music8_song_id)
--   where music8_song_id is not null;
