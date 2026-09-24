# Supabase Data API のテーブル権限（2026-10-30 以降）

2026-09 に Supabase から来た案内のメモ。**既存テーブルは変更不要。** 10月30日以降に `public` へ新しく作るテーブルだけ、Data API 用の `GRANT` を SQL に書く。

## 何が変わるか

これまで Supabase は、`public` に作ったテーブルへ Data API（supabase-js / PostgREST / GraphQL）用の権限を自動で付けていた。**2026-10-30 以降、その自動付与が止まる。**

- すでに存在するテーブルの権限はそのまま。アプリを動かし続けるための作業はない。
- それ以降の新規テーブルは、`GRANT` がないと API が `permission denied` を返す。エラー文に実行すべき `GRANT` が出る。
- SQL Editor で作る場合も、マイグレーションで作る場合も同じ。新規プロジェクト・preview branch・`supabase db reset` でテーブルを作り直したときも、`GRANT` が無い SQL だと Data API から届かない。

このリポジトリに `supabase/migrations` はない。テーブル追加は `docs/supabase-setup.md` や `docs/supabase-*.md`・`docs/sql/` の SQL を SQL Editor で実行する。

## GRANT と RLS は別

- **GRANT** … そのロールがテーブルに触ってよいか（これが無いと API が拒否する）
- **RLS** … 触れる行はどれか（従来どおり `enable row level security` と `create policy` が必要）

RLS だけ書いても、10月30日以降の新規テーブルは API から届かない。

## このアプリで付けるロール

| ロール | いつ必要か |
|--------|------------|
| `authenticated` | ブラウザ `src/lib/supabase/client.ts` とサーバー `src/lib/supabase/server.ts`。anon キーだが、ログイン中のリクエストはこのロールになる |
| `service_role` | `createAdminClient()`（`src/lib/supabase/admin.ts`）。RLS は迂回するが、テーブルの GRANT は必要 |
| `anon` | ゲストに読ませるテーブルだけ。ポリシーが `using (true)` のもの（例: `song_style`・`song_commentary`） |

ユーザー個人の行（`auth.uid() = user_id`）には `anon` への `SELECT` を付けない。メール例の「全テーブルに anon SELECT」はこのアプリには広すぎる。

`gen_random_uuid()` の主キーならシーケンス権限は不要。`serial` / `bigserial` を使うときは、同じロールへシーケンスの `USAGE, SELECT` も付ける。

## 新規テーブルの SQL に足すブロック

`CREATE TABLE` と RLS の直後に書く。操作はポリシーに合わせ、使わない DML は外してよい。

```sql
grant select, insert, update, delete
on public.your_table
to authenticated;

grant select, insert, update, delete
on public.your_table
to service_role;

-- ゲストにも読ませるテーブルだけ
-- grant select on public.your_table to anon;
```

## 既存の docs SQL

`docs/` の作成 SQLは `CREATE TABLE` と RLS だけで、`GRANT` は書いていない。作成済みの本番テーブルは自動付与が残っているので、過去分を一括で書き換える必要はない。

10月30日より後にその SQL を新規プロジェクトや作り直しで流すときは、上記ブロックを足してから実行する。
