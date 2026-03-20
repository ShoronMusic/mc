# comment_feedback テーブル：詳細フィードバック用カラム追加

AIコメントに対する「詳細フィードバック」（重複／真偽が怪しい／曖昧のチェック＋自由コメント）を保存するため、既存の `comment_feedback` にカラムを追加します。

## 追加カラム

| カラム | 型 | 説明 |
|--------|-----|------|
| is_duplicate | boolean | コメント内容が重複（デフォルト false） |
| is_dubious | boolean | コメント内容の真偽が怪しい（デフォルト false） |
| is_ambiguous | boolean | コメント内容が曖昧・ありきたり（正誤はないが陳腐）（デフォルト false） |
| free_comment | text | 自由コメント本文（任意） |

Good/悪いのみのフィードバックではこれらのカラムは使わず、詳細フィードバック送信時のみ設定します。

## 実行する SQL

Supabase ダッシュボードの **SQL Editor** で次を実行してください。

```sql
-- 詳細フィードバック用カラム追加（既存テーブルに追加）
alter table public.comment_feedback
  add column if not exists is_duplicate boolean default false,
  add column if not exists is_dubious boolean default false,
  add column if not exists is_ambiguous boolean default false,
  add column if not exists free_comment text;
```

既存の行は新カラムが NULL またはデフォルト値になります。アプリ側では詳細フィードバック時のみこれらのカラムに値を入れます。
