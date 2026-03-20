# ルーム視聴履歴テーブル（プレイヤー下リスト用）

ルーム全体で「誰がいつ何を流したか」を表示する視聴履歴用テーブルです。

## 作成手順

1. Supabase ダッシュボードで **SQL Editor** を開く。
2. 次の SQL を実行する。

```sql
-- ルームごとの視聴履歴（曲が流れた約10秒後に1件追加。同じ人・同じ曲は2分以内は同一扱いで重複しない）
create table if not exists public.room_playback_history (
  id uuid primary key default gen_random_uuid(),
  room_id text not null,
  video_id text not null,
  display_name text not null,
  is_guest boolean not null default false,
  user_id uuid references auth.users(id) on delete set null,
  played_at timestamptz not null default now(),
  title text,
  artist_name text,
  style text,
  created_at timestamptz not null default now()
);

create index if not exists idx_room_playback_history_room_played
  on public.room_playback_history (room_id, played_at desc);

create index if not exists idx_room_playback_history_dedupe
  on public.room_playback_history (room_id, video_id, played_at);

alter table public.room_playback_history enable row level security;

-- 挿入: 誰でも可（ゲストも曲を貼るため）
create policy "Anyone can insert room playback history"
  on public.room_playback_history for insert
  with check (true);

-- 参照: 誰でも可（ルーム参加者が一覧を見る）
create policy "Anyone can select room playback history"
  on public.room_playback_history for select
  using (true);

-- 更新: 誰でも可（視聴履歴のスタイルをユーザーが修正して学習させるため）
create policy "Anyone can update room playback history"
  on public.room_playback_history for update
  using (true)
  with check (true);
```

## カラム説明

| カラム | 型 | 説明 |
|--------|-----|------|
| id | uuid | 主キー |
| room_id | text | ルームID |
| video_id | text | YouTube 動画ID |
| display_name | text | 表示名（ゲストは "ニックネーム (G)" 形式で保存） |
| is_guest | boolean | ゲストかどうか |
| user_id | uuid | ログインユーザーの場合のみ。ゲストは null |
| played_at | timestamptz | 再生開始とみなす時刻（約10秒後に記録） |
| title | text | 動画タイトル（oEmbed から取得、将来用） |
| artist_name | text | チャンネル名等（将来用） |
| style | text | 将来用（Pop, R&B など） |
| created_at | timestamptz | レコード作成時刻 |

将来カラムを増やす場合は `alter table public.room_playback_history add column ...` で追加してください。

## 既存テーブルに style を追加する場合

テーブルを先に作成していて `style` カラムがない場合（スタイル変更が再読み込みで戻る場合）、以下を実行してください。

```sql
alter table public.room_playback_history add column if not exists style text;
```

## スタイル手動変更を動かすために

視聴履歴の「スタイルを変更」で保存する先は **2 つ** です。

| 保存先 | 役割 |
|--------|------|
| **room_playback_history.style** | その履歴行の表示スタイル（上記の `style` カラム必須） |
| **song_style テーブル** | video_id ごとのスタイルキャッシュ。同じ曲を再度貼ったときに AI を呼ばずこの値を使う |

どちらかが欠けていると期待どおり動きません。

- `style` カラムがない → 履歴行の更新で 404、保存ボタンで「該当する履歴が見つかりません」になることがあります。
- **song_style テーブルがない** → 履歴行のスタイルは更新されますが、同じ曲を再度貼ったときに手動で付けたスタイルが使われません。**docs/supabase-song-style-table.md** の SQL で `song_style` テーブルを作成してください。

### スタイル変更を特定ユーザー（例：小龍）だけに限定する

`.env.local` に **管理者の Supabase Auth ユーザー UUID** を指定します（ダッシュボード **Authentication → Users** で該当ユーザーの UUID をコピー）。

```env
STYLE_ADMIN_USER_IDS=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

複数人にする場合はカンマ区切り。設定すると:

- **PATCH** は上記 UUID でログインしているユーザーのみ成功（それ以外は 403）。
- 視聴履歴のスタイル列は、管理者ログイン時のみクリックで変更モーダルが開きます（ゲスト・他ユーザーは表示のみ）。

未設定または空のときは、従来どおり誰でもスタイル変更できます。

**注意**: 管理者は **ユーザー登録でログインしたアカウント**である必要があります。ゲスト表示名が「小龍」だけでは管理者扱いになりません。

### ゲストや「他人が貼った曲」でもスタイル変更したい場合

API の PATCH では、**.env.local に `SUPABASE_SERVICE_ROLE_KEY` を設定**すると、RLS をバイパスして誰が貼った履歴でもスタイルを更新できます。未設定の場合は通常の Supabase クライアント（セッション付き）で更新するため、RLS の「Anyone can update」ポリシーが必須です。サービスロールを設定しておくと、ゲスト入室時や他参加者が貼った曲でもスタイル変更が確実に反映されます。
