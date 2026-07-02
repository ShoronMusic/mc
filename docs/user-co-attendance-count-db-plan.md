# ユーザー同席回数（DB 化計画・後対応）

部屋内で他登録ユーザーのプロフィールモーダルに表示する **「◯◯さんとの同席回数 × N」** について、現状実装と将来の DB 専用テーブル化のメモです。

**ステータス（2026-07-02）**

- **UI・集計（暫定）**: 実装済み。クリック時のみ表示。
- **専用テーブル**: 未作成（本ドキュメントの SQL 実行後に実装予定）。

---

## 現状実装（暫定）

| 項目 | 内容 |
|------|------|
| 表示 | 参加者欄のプロフィールアイコン → モーダル最下部 |
| アイコン | 公開プロフィール ON＝緑 ID アイコン / 未公開・未入力＝グレー `UserCircleIcon` |
| 集計 | `user_room_participation_history` の **同一 `gathering_id`** を distinct カウント |
| API | `GET /api/user/public-profile?forUserId=…` の `coAttendanceCount` |
| 集計 lib | `src/lib/user-co-attendance-count.ts` |
| UI | `src/components/room/UserBar.tsx`・`ParticipantPublicProfileModal.tsx` |

### 負荷の整理

- **トリガー**: モーダルを開いたときのみ（Ably ポーリング・在室表示とは無関係）。
- **DB**: 1 表示あたりクエリ 2 本（service role）。`user_id` で絞るため、参加回数が数百程度なら問題になりにくい。
- **ボトルネックになりうる条件**: 参加履歴が数千行以上／参加者欄への常時表示／マイページでランキング表示など。

現 β 段階では **履歴からの都度集計のまま運用** でよい。専用テーブルは下記タイミングで検討する。

---

## 専用テーブル化するタイミング（目安）

次のいずれかが必要になったら DB 化を優先する。

1. 参加者名の横に同席回数を **常時** 表示したい
2. マイページで「よく同席したユーザー TOP N」など **横断一覧** が欲しい
3. プロフィール表示の体感 latency が悪化した（ヘビーユーザーの履歴増）

---

## 提案スキーマ

ペアは UUID の辞書順で `(user_a, user_b)` に正規化し、1 ペア 1 行とする。

```sql
-- Supabase SQL Editor（未実行・将来用）
create table if not exists public.user_co_attendance (
  user_a uuid not null references auth.users (id) on delete cascade,
  user_b uuid not null references auth.users (id) on delete cascade,
  gathering_count integer not null default 0 check (gathering_count >= 0),
  last_gathering_id uuid null references public.room_gatherings (id) on delete set null,
  last_at timestamptz null,
  updated_at timestamptz not null default now(),
  primary key (user_a, user_b),
  check (user_a < user_b)
);

create index if not exists idx_user_co_attendance_user_a
  on public.user_co_attendance (user_a);

create index if not exists idx_user_co_attendance_user_b
  on public.user_co_attendance (user_b);

alter table public.user_co_attendance enable row level security;

-- 読み書きは service_role（API）のみ想定。本人は自分が user_a または user_b の行だけ SELECT 可にする案:
-- create policy "co_attendance_select_involving_self"
--   on public.user_co_attendance for select
--   using (auth.uid() = user_a or auth.uid() = user_b);
```

| 列 | 説明 |
|----|------|
| `user_a` / `user_b` | 正規化済みペア（`user_a < user_b`） |
| `gathering_count` | 同席した「会」の回数 |
| `last_gathering_id` | 直近で同席した会（任意・デバッグ用） |
| `last_at` | 直近同席の会終了時刻など |

---

## 更新タイミング（推奨）

**会終了時**に一括更新するのが自然（`room_gathering_snapshots` と同じタイミング）。

1. `src/lib/room-gathering-snapshot.ts` で会終了処理が走る
2. 当該 `gathering_id` に **`user_id` 付き**で参加した登録ユーザーを列挙  
   （既存: `user_room_participation_history` または `room_gathering_participant_snapshots`）
3. 参加者集合の **全ペア** について `user_co_attendance` を upsert（`gathering_count + 1`）

入室のたびにリアルタイム更新も可能だが、Ably 切断・`leave` 漏れでズレやすいため **終了時集計を主** とする。

---

## 読み取り API（将来）

暫定の `countCoAttendanceGatherings` を置き換え:

```sql
-- viewer = :me, target = :other のとき
select gathering_count
from user_co_attendance
where user_a = least(:me, :other) and user_b = greatest(:me, :other);
```

`GET /api/user/public-profile` の `coAttendanceCount` は上記 1 行読みに差し替え。

---

## 過去分の移行（バックフィル）

テーブル作成後、既存 `user_room_participation_history` から一括投入するスクリプトを 1 回実行する想定。

1. `gathering_id is not null` の行を `gathering_id` ごとに `user_id` 集合化
2. 各会の登録ユーザー集合からペア生成
3. `user_co_attendance` に `gathering_count` を集計して upsert

**注意**: 会の途中で片方だけ参加記録がある行は、終了時更新と同様に「両方の行がある gathering のみ」カウントするルールを揃える。

---

## 暫定のまま運用する間の改善（任意）

専用テーブル前に遅くなった場合の中間策:

1. インデックス追加: `user_room_participation_history (user_id, gathering_id)` where `gathering_id is not null`
2. 集計を 1 クエリ（`JOIN` + `count distinct gathering_id`）に統合
3. 同一 `(viewer, target)` ペアの短期キャッシュ（例: 5 分）

---

## 関連ドキュメント

- 参加履歴: `docs/supabase-setup.md` 第 10 章・`docs/recorded-data-fields.md`
- 会終了スナップショット: `docs/supabase-room-gathering-snapshots-table.md`
- 公開プロフィール: `docs/supabase-setup.md` 第 16 章
