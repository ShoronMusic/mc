# 会（Live Session）仕様メモ

最終更新: 2026-04-01

このドキュメントは「常設ルームを使った会の開催管理」を段階実装するための仕様メモ。

## 決定事項（現時点）

- 常設ルームは固定 ID を使う。
- 同じ常設ルームで同時に複数の `live` は作らない（room ごとに `live` は最大 1）。
- 視聴履歴はルーム単位で継続保存する（会ごとにリセットしない）。
- 会が `live` の間は、そのルームは会専用とする。
- 会がない時間のフリー利用は許可しない。
- ルーム URL 直アクセス時、`live` でないなら表示専用メッセージを出す（入室不可）。
- トップページの会一覧は「開催中（live）」のみ表示する。
- 以前に使っていた「スナップショット」用語は使わない。
- 前回の状態再現は行わず、会話は毎回新しく始める。
- サブリーダー権限は後続フェーズで検討する。

## 用語

- 会: 開催単位。タイトル、ルーム ID、状態（`live` / `ended`）などを持つ。
- 会話セグメント: 会の `live` 中に作られたチャットのまとまり。
- 視聴履歴: `room_playback_history`。会に関係なく room 単位で継続記録。

## フェーズ実装方針

### Phase 1（今回）

- `room_gatherings` から `live` 状態を参照できる API を追加する。
- トップページで `live` の会だけ表示する。
- ルーム入室前に `live` 判定を行い、`live` でなければ表示専用メッセージを出す。

### Phase 2（進行中）

- **会を開始する最小 UI**（トップページ・ログイン中のみ表示）  
  - `POST /api/room-gatherings` … `action: 'start' | 'end'`, `roomId`, `title`（開始時）
- **マイページ**: 主催者（`room_gatherings.created_by` が開催中の会）またはチャットオーナーが、`room_lobby_message` に **部屋タイトル**（`display_title`）と **PR文**（`message`）を保存。詳細は `docs/supabase-setup.md` 9 章。
- 「全員退出で終了」の確定ロジック（presence タイムアウト、強制退出との整合）はこれから。

#### RLS メモ（Supabase）

`room_gatherings` に RLS を有効にする場合の例（本番前に調整）:

- **一覧・入室判定**（`GET /api/room-live-status`）は未ログインでも使うため、`status = 'live'` の行に対する **SELECT を anon 許可**するか、読み取り専用 API をサービスロールで実装する必要がある。
- **開始・終了**（`POST /api/room-gatherings`）は **ログインユーザー**が `insert` / `update` できるポリシーが必要（または運用でサービスロールのみ更新、は別案）。

### Phase 3（次）

- チャット保存を会話セグメント付きにする（会ごとの閲覧を可能にする）。
- マイページの参加履歴に会タイトル・日時を表示する。

## DB（最小要件）

以下は最小の参考 SQL（本番適用前に RLS/権限/監査列を要レビュー）。

```sql
create table if not exists public.room_gatherings (
  id uuid primary key default gen_random_uuid(),
  room_id text not null,
  title text not null,
  status text not null check (status in ('live', 'ended')),
  started_at timestamptz null,
  ended_at timestamptz null,
  created_by uuid null,
  created_at timestamptz not null default now()
);

create index if not exists room_gatherings_room_status_idx
  on public.room_gatherings (room_id, status);
```

## 相談が必要な論点（未決）

- 会の作成と `live` 開始を同一操作にするか（予定作成を分けるか）。
- `ended` から再び `live` へ戻す運用を許すか（同一会の再開ポリシー）。
- 会話セグメントのキー設計（`gathering_id` のみ / 追加の連番セグメント）。
- サブリーダーの付与・剥奪・通知仕様。
