-- Genre BEST: WP プレイリスト thumbnail → cover_image_url
-- 既存 DB 向けパッチ。再実行可。
-- 正本の create 定義は music8-catalog-extension.sql にも同列を含む。

alter table public.catalog_playlists
  add column if not exists cover_image_url text null;
