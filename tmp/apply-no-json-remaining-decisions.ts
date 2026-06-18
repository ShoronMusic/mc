/**
 * backfill-multi-artist-no-json-remaining.csv の手動注釈を適用:
 * - 次行が WP post id（数字）→ WP REST から music8 データを紐づけ
 * - 次行が「データ削除」→ songs マスタ削除
 *
 *   npx tsx tmp/apply-no-json-remaining-decisions.ts
 *   npx tsx tmp/apply-no-json-remaining-decisions.ts --apply
 */
import fs from 'node:fs';
import path from 'node:path';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  attachMusic8JsonToSongMaster,
  loadAdminSongMusic8Context,
  resolveArtistSongLookupForAdmin,
} from '@/lib/admin-song-music8-resolve';
import { deleteSongMasterCascade } from '@/lib/admin-delete-song-master';
import { fetchMusic8SongFromWpRest, isMusic8WpRestEnabled } from '@/lib/music8-wp-rest';

const CSV_PATH = 'tmp/backfill-multi-artist-no-json-remaining.csv';
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ParsedRow = {
  id: string;
  display_title: string;
  main_artist: string;
  song_title: string;
  action: { kind: 'wp_post'; postId: number } | { kind: 'delete' };
};

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

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function parseAnnotatedCsv(csvPath: string): ParsedRow[] {
  const lines = fs.readFileSync(path.resolve(csvPath), 'utf8').split(/\r?\n/);
  const rows: ParsedRow[] = [];
  let i = 0;
  if (lines[0]?.toLowerCase().startsWith('id,')) i = 1;

  while (i < lines.length) {
    const line = lines[i]!.trim();
    i++;
    if (!line) continue;

    const id = line.split(',')[0]?.trim().replace(/^"/, '').replace(/"$/, '') ?? '';
    if (!UUID_RE.test(id)) continue;

    const cols = parseCsvLine(line);
    const display_title = cols[1] ?? '';
    const main_artist = cols[2] ?? '';
    const song_title = cols[3] ?? '';

    while (i < lines.length && !lines[i]!.trim()) i++;
    const actionLine = (lines[i] ?? '').trim();
    if (!actionLine) {
      throw new Error(`${id}: 注釈行（post id または データ削除）がありません`);
    }
    i++;

    if (actionLine === 'データ削除') {
      rows.push({ id, display_title, main_artist, song_title, action: { kind: 'delete' } });
      continue;
    }

    const postId = Number.parseInt(actionLine, 10);
    if (!Number.isFinite(postId) || postId <= 0) {
      throw new Error(`${id}: 不明な注釈 "${actionLine}"`);
    }
    rows.push({ id, display_title, main_artist, song_title, action: { kind: 'wp_post', postId } });
  }

  return rows;
}

async function importFromWpPost(songId: string, postId: number): Promise<void> {
  const loaded = await loadAdminSongMusic8Context(songId);
  if (!loaded.ok) throw new Error(loaded.error);

  const json = await fetchMusic8SongFromWpRest({
    artistLookup: loaded.ctx.lookup.artistLookup,
    songLookupTitle: loaded.ctx.lookup.songLookupTitle,
    videoId: null,
    music8SongId: postId,
  });
  if (!json) {
    throw new Error(`WP post ${postId} を取得できませんでした`);
  }
  const wpId = typeof json.id === 'number' ? json.id : null;
  if (wpId !== postId) {
    throw new Error(`WP post id 不一致: expected=${postId} got=${wpId ?? 'null'}`);
  }

  const attached = await attachMusic8JsonToSongMaster(songId, json);
  if (!attached.ok) throw new Error(attached.error);
}

async function main(): Promise<void> {
  loadDotEnvLocal();
  const apply = process.argv.includes('--apply');
  const rows = parseAnnotatedCsv(CSV_PATH);

  if (!isMusic8WpRestEnabled()) {
    throw new Error('MUSIC8_WP_REST_BASE_URL が無効です');
  }

  const admin = createAdminClient();
  if (!admin) throw new Error('createAdminClient failed');

  const wpRows = rows.filter((r) => r.action.kind === 'wp_post');
  const delRows = rows.filter((r) => r.action.kind === 'delete');

  console.log(`[apply-decisions] mode=${apply ? 'APPLY' : 'dry-run'} wp=${wpRows.length} delete=${delRows.length}`);

  for (const row of wpRows) {
    const postId = row.action.kind === 'wp_post' ? row.action.postId : 0;
    const lookup = resolveArtistSongLookupForAdmin(row);
    console.log(
      `[wp-import] ${row.display_title || row.id} postId=${postId} lookup=${lookup?.artistLookup ?? '?'} / ${lookup?.songLookupTitle ?? '?'}`,
    );
    if (apply) {
      await importFromWpPost(row.id, postId);
      console.log(`  -> attached music8_song_data (post ${postId})`);
    }
  }

  for (const row of delRows) {
    console.log(`[delete] ${row.display_title || row.id} (${row.id})`);
    if (apply) {
      const result = await deleteSongMasterCascade(admin, row.id);
      if (!result.ok) throw new Error(`${row.id}: ${result.message}`);
      console.log('  -> deleted');
    }
  }

  console.log('[apply-decisions] done');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
