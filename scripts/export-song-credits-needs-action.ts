/**
 * 対応が必要な曲の一覧を JSONL + サマリ JSON で出力。
 *
 * - no_credits: song_credits が 0 件
 * - partial: 1 人以上いるが unresolved あり（planSongCreditDbRows 判定）
 *
 * Usage:
 *   npx tsx scripts/export-song-credits-needs-action.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { createAdminClient } from '@/lib/supabase/admin';
import { extractCreditNamesFromSong, type SongCreditInput } from '@/lib/song-credits-resolve';
import {
  clearArtistLookupIndexCache,
  loadArtistLookupIndex,
  planSongCreditDbRows,
} from '@/lib/song-credits-sync';

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

type ActionRow = {
  song_id: string;
  display_title: string | null;
  issue: 'no_credits' | 'partial_unresolved';
  source: string | null;
  credit_count: number;
  unresolved: string[];
  credit_names: string[];
  action_hint: string;
};

async function main(): Promise<void> {
  loadDotEnvLocal();
  const admin = createAdminClient();
  if (!admin) {
    console.error('createAdminClient failed');
    process.exit(1);
  }

  clearArtistLookupIndexCache();
  const index = await loadArtistLookupIndex(admin);

  const { count: totalSongs } = await admin.from('songs').select('*', { count: 'exact', head: true });
  const { count: creditRows } = await admin.from('song_credits').select('*', { count: 'exact', head: true });

  const rows: ActionRow[] = [];
  const PAGE = 100;
  let scanOffset = 0;
  let processed = 0;

  for (;;) {
    const { data: batch, error } = await admin
      .from('songs')
      .select('id, display_title, spotify_artists, main_artist, music8_song_data')
      .order('id')
      .range(scanOffset, scanOffset + PAGE - 1);
    if (error) throw error;
    if (!batch?.length) break;

    const ids = batch.map((r) => (r as { id: string }).id);
    const { data: creds } = await admin.from('song_credits').select('song_id').in('song_id', ids);
    const hasCredit = new Set((creds ?? []).map((c) => (c as { song_id: string }).song_id));

    for (const row of batch) {
      processed++;
      const songId = (row as { id: string }).id;
      const displayTitle = (row as { display_title?: string | null }).display_title ?? null;
      const input: SongCreditInput = {
        display_title: displayTitle,
        spotify_artists: (row as { spotify_artists?: string | null }).spotify_artists ?? null,
        main_artist: (row as { main_artist?: string | null }).main_artist ?? null,
        music8_song_data:
          (row as { music8_song_data?: Record<string, unknown> | null }).music8_song_data ?? null,
      };
      const planned = planSongCreditDbRows(songId, input, index);
      const extracted = extractCreditNamesFromSong(input);
      const creditNames = extracted?.names ?? [];

      if (!hasCredit.has(songId)) {
        rows.push({
          song_id: songId,
          display_title: displayTitle,
          issue: 'no_credits',
          source: planned.source,
          credit_count: 0,
          unresolved: planned.unresolved.length > 0 ? planned.unresolved : creditNames,
          credit_names: creditNames,
          action_hint:
            planned.unresolved.length > 0
              ? 'artists追加 or spotify/main_artist修正後に再同期'
              : 'クレジット名なし: メタデータ確認',
        });
        continue;
      }

      if (planned.unresolved.length > 0) {
        rows.push({
          song_id: songId,
          display_title: displayTitle,
          issue: 'partial_unresolved',
          source: planned.source,
          credit_count: planned.creditCount,
          unresolved: planned.unresolved,
          credit_names: creditNames,
          action_hint: '未登録の共演者を artists に追加後、該当曲のみ再同期',
        });
      }
    }

    scanOffset += batch.length;
    if (batch.length < PAGE) break;
  }

  const noCredits = rows.filter((r) => r.issue === 'no_credits');
  const partial = rows.filter((r) => r.issue === 'partial_unresolved');

  const outDir = path.resolve(process.cwd(), 'tmp');
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const jsonlPath = path.join(outDir, `song-credits-needs-action-${stamp}.jsonl`);
  const summaryPath = path.join(outDir, `song-credits-needs-action-${stamp}-summary.json`);

  fs.writeFileSync(jsonlPath, rows.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8');
  fs.writeFileSync(
    summaryPath,
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        total_songs: totalSongs,
        song_credits_rows: creditRows,
        scanned: processed,
        needs_action_total: rows.length,
        no_credits: noCredits.length,
        partial_unresolved: partial.length,
        ok_approx: (totalSongs ?? 0) - rows.length,
        list_jsonl: jsonlPath,
      },
      null,
      2,
    ),
    'utf8',
  );

  console.log(JSON.stringify(JSON.parse(fs.readFileSync(summaryPath, 'utf8')), null, 2));
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
