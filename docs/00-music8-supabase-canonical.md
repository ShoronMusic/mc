# 運用: Music8 曲DB を Supabase 正本にする

1. Supabase SQL Editor で [`sql/music8-catalog-extension.sql`](./sql/music8-catalog-extension.sql) を実行する。
2. 既存曲がある場合、ローカル JSON から中間テーブルを埋める:
   `npx tsx scripts/import-music8-wp-catalog.ts --songs-dir=E:/m8/public/data/songs --apply`
3. 新規登録は `/admin/songs/new`（Chrome 拡張 YT to M7 → `localhost:3002`）。
4. JSON 増分: 登録 API が自動。全件は `npx tsx scripts/export-music8-json-from-supabase.ts --full`
5. 公開フロントは `E:\m8`（[`E:\m8\docs\supabase-source-of-truth.md`](../../m8/docs/supabase-source-of-truth.md)）。WP への逆同期はしない。

人間が手で実行する手順の図: [`00-music8-human-update-flow.md`](./00-music8-human-update-flow.md)  
WP 比較とタスク一覧: [`00-music8-wp-to-supabase-tasks.md`](./00-music8-wp-to-supabase-tasks.md)

詳細: [`supabase-music8-catalog-tables.md`](./supabase-music8-catalog-tables.md)
