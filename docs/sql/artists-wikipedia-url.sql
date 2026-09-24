-- 英語版以外の Wikipedia 記事 URL（公開リンクは wikipedia_page より優先）
-- 実行: Supabase SQL Editor。再実行しても安全（IF NOT EXISTS）。
-- 例: https://de.wikipedia.org/wiki/Velveteen_Queen
-- 詳細: docs/supabase-songs-and-performances-tables.md

alter table public.artists add column if not exists wikipedia_url text null;
