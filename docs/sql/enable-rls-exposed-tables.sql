-- Supabase advisor: rls_disabled_in_public（2026-09-27）
-- 匿名キーで全行の読み書き削除ができていた public テーブル。
-- アプリのサーバー処理は service_role（RLS を迂回）に寄せ済み。
-- この SQL は Supabase SQL Editor で 1 回実行する。
--
-- ポリシーを付けない操作は anon / authenticated から拒否される。
-- マイページはログイン中ユーザーが song_era と自分の視聴履歴だけ SELECT する。

alter table public.songs enable row level security;
alter table public.song_videos enable row level security;
alter table public.song_era enable row level security;
alter table public.song_tidbits enable row level security;
alter table public.song_spotify_review_queue enable row level security;
alter table public.comment_feedback enable row level security;
alter table public.room_gatherings enable row level security;
alter table public.room_playback_history enable row level security;

-- song_era / comment_feedback / room_playback_history には
-- RLS 無効のまま残っていた許可ポリシーがあり、有効化後も匿名の読み書きが通る。
-- 名前が不明な既存ポリシーを外してから、必要な SELECT だけ付け直す。
do $$
declare r record;
begin
  for r in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('song_era', 'comment_feedback', 'room_playback_history')
  loop
    execute format('drop policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

create policy "authenticated select song_era"
  on public.song_era
  for select
  to authenticated
  using (true);

create policy "own room_playback_history select"
  on public.room_playback_history
  for select
  to authenticated
  using (user_id = auth.uid());
