/**
 * 開催履歴スナップショットの DB 状態を調査（ローカル .env.local 使用）
 * 実行: npx tsx scripts/diagnose-gathering-snapshots.ts
 */
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

function loadDotEnvLocal(): void {
  const p = path.resolve(process.cwd(), '.env.local');
  if (!fs.existsSync(p)) return;
  for (const raw of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadDotEnvLocal();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!url || !key) {
  console.error('NEXT_PUBLIC_SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY が .env.local に必要です。');
  process.exit(1);
}

const admin = createClient(url, key, { auth: { persistSession: false } });

async function main() {
  console.log('=== 開催履歴スナップショット DB 調査 ===\n');

  const snapProbe = await admin.from('room_gathering_snapshots').select('gathering_id', { count: 'exact', head: true });
  if (snapProbe.error?.code === '42P01') {
    console.log('❌ room_gathering_snapshots テーブル: 存在しません');
    console.log('   → docs/supabase-room-gathering-snapshots-table.md の SQL を実行してください。\n');
  } else if (snapProbe.error) {
    console.log('❌ room_gathering_snapshots 読み取りエラー:', snapProbe.error.message);
  } else {
    console.log(`✅ room_gathering_snapshots テーブル: 存在（行数 ${snapProbe.count ?? 0}）\n`);
  }

  const { data: allGatherings, error: allErr } = await admin
    .from('room_gatherings')
    .select('id, room_id, title, status, started_at, ended_at, created_at')
    .order('created_at', { ascending: false })
    .limit(20);

  if (!allErr && allGatherings) {
    const live = allGatherings.filter((g) => g.status === 'live');
    const endedAll = allGatherings.filter((g) => g.status === 'ended');
    console.log(`room_gatherings 全体（直近20件）: ${allGatherings.length} 件`);
    console.log(`  live: ${live.length} / ended: ${endedAll.length} / その他: ${allGatherings.length - live.length - endedAll.length}\n`);
    if (allGatherings.length > 0) {
      console.log('--- 会一覧（新しい順・最大20件）---');
      for (const g of allGatherings) {
        const st = g.status ?? '—';
        const endedStr = g.ended_at ? new Date(g.ended_at).toLocaleString('ja-JP') : '—';
        const startedStr = g.started_at ? new Date(g.started_at).toLocaleString('ja-JP') : '—';
        console.log(`  [${st}] 部屋 ${g.room_id} | ${g.title?.slice(0, 28) ?? '—'} | 開始 ${startedStr} | 終了 ${endedStr}`);
      }
      console.log('');
    }
  }

  const { data: ended, error: endedErr } = await admin
    .from('room_gatherings')
    .select('id, room_id, title, status, started_at, ended_at, created_at')
    .eq('status', 'ended')
    .order('ended_at', { ascending: false, nullsFirst: false })
    .limit(15);

  if (endedErr?.code === '42P01') {
    console.log('❌ room_gatherings テーブル: 存在しません\n');
    return;
  }
  if (endedErr) {
    console.log('❌ room_gatherings エラー:', endedErr.message, '\n');
    return;
  }

  const endedList = ended ?? [];
  console.log(`room_gatherings（status=ended）: 直近15件中 ${endedList.length} 件取得\n`);

  if (endedList.length === 0) {
    console.log('→ 終了済みの会がありません。会を開始して終了するとスナップショット対象になります。\n');
    return;
  }

  const since60 = new Date(Date.now() - 60 * 86400000).toISOString();
  const inWindow = endedList.filter((g) => g.ended_at && g.ended_at >= since60);
  console.log(`  うち直近60日以内に終了: ${inWindow.length} 件\n`);

  console.log('--- 終了会一覧（新しい順）---');
  for (const g of endedList) {
    const { data: snap } = await admin
      .from('room_gathering_snapshots')
      .select('gathering_id, song_count_total, gemini_calls, created_at')
      .eq('gathering_id', g.id)
      .maybeSingle();

    const hasSnap = snap ? '✅ スナップショットあり' : '⬜ スナップショットなし';
    const endedStr = g.ended_at ? new Date(g.ended_at).toLocaleString('ja-JP') : '—';
    console.log(
      `${hasSnap} | 部屋 ${g.room_id} | ${g.title?.slice(0, 30) ?? '—'} | 終了 ${endedStr} | id ${g.id}`,
    );
    if (snap) {
      console.log(
        `           選曲 ${snap.song_count_total} / Gemini ${snap.gemini_calls} 回 / 保存 ${snap.created_at}`,
      );
    }
  }

  console.log('\n--- 管理画面が空になる主な理由 ---');
  if (snapProbe.count === 0 && endedList.length > 0) {
    console.log('• 終了会はあるがスナップショットが0件 → 会終了がスナップショット実装前、または保存がスキップされた');
    console.log('  （テーブル作成前の終了 / SUPABASE_SERVICE_ROLE_KEY 未設定時の終了 等）');
    console.log('• 対策: 新しく会を開始 → 終了 すると自動保存されます（過去分は遡及しません）');
  } else if (endedList.length === 0) {
    console.log('• 終了済みの会自体がありません');
  } else if (inWindow.length === 0 && (snapProbe.count ?? 0) > 0) {
    console.log('• スナップショットはあるが直近60日の ended_at フィルタに引っかかっていない可能性');
  }
  console.log('');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
