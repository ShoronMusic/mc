/**
 * ライブラリ曲詳細と同じ定義で件数を出す。
 * - 曲解説: song_tidbits.ai_commentary（有効・本文あり）または song_commentary。曲単位（songs.id）
 * - Music8 曲紹介: ローカル曲 JSON に紹介文があり、songs の slug と一致
 *
 * Usage:
 *   npx tsx scripts/count-library-commentary-vs-music8.ts
 *   npx tsx scripts/count-library-commentary-vs-music8.ts --songs-dir="E:\m8\public\data\songs"
 */
import fs from 'node:fs';
import path from 'node:path';
import { createAdminClient } from '@/lib/supabase/admin';
import { extractMusic8SongFields } from '@/lib/music8-song-fields';

const PAGE = 1000;
const DEFAULT_SONGS_DIR = 'E:\\m8\\public\\data\\songs';

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

function stripMetaLines(text: string): string {
  return text
    .split(/\r?\n/)
    .filter((line) => !/^\s*(ジャンル|ボーカル|スタイル|Genre|Vocal|Style)\s*[:：]/i.test(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function htmlToPlain(raw: string): string {
  return raw
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** LibraryMusic8SongComment と同じ「紹介文がある」判定 */
function music8JsonHasIntro(json: unknown): boolean {
  const extracted = htmlToPlain(extractMusic8SongFields(json).description);
  const obj = json && typeof json === 'object' && !Array.isArray(json) ? (json as Record<string, unknown>) : null;
  const contentRaw = obj?.content ?? obj?.description;
  const contentStr =
    typeof contentRaw === 'string'
      ? contentRaw
      : contentRaw && typeof contentRaw === 'object' && !Array.isArray(contentRaw)
        ? String((contentRaw as { rendered?: unknown }).rendered ?? '')
        : '';
  const fromContent = htmlToPlain(contentStr);
  const facts = extracted ? stripMetaLines(extracted) : '';
  const content = fromContent ? stripMetaLines(fromContent) : '';
  return Boolean(content || facts);
}

function slugKey(artistSlug: string | null | undefined, songSlug: string | null | undefined): string | null {
  const a = (artistSlug ?? '').trim().toLowerCase();
  const s = (songSlug ?? '').trim().toLowerCase();
  if (!a || !s) return null;
  return `${a}_${s}`;
}

async function pageAll<T>(
  fetchPage: (from: number, to: number) => Promise<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const out: T[] = [];
  let from = 0;
  for (;;) {
    const to = from + PAGE - 1;
    const { data, error } = await fetchPage(from, to);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < PAGE) break;
    from += PAGE;
  }
  return out;
}

async function main(): Promise<void> {
  loadDotEnvLocal();
  const dirArg = process.argv.find((a) => a.startsWith('--songs-dir='));
  const songsDir = dirArg ? dirArg.slice('--songs-dir='.length).trim() : DEFAULT_SONGS_DIR;

  const admin = createAdminClient();
  if (!admin) {
    console.error('createAdminClient failed（.env.local の SUPABASE_SERVICE_ROLE_KEY を確認）');
    process.exit(1);
  }

  const { count: totalSongs, error: totalErr } = await admin
    .from('songs')
    .select('*', { count: 'exact', head: true });
  if (totalErr) throw totalErr;

  const tidbits = await pageAll<{ song_id: string | null; video_id: string | null; body: string | null }>(
    async (from, to) =>
      admin
        .from('song_tidbits')
        .select('song_id, video_id, body')
        .eq('source', 'ai_commentary')
        .eq('is_active', true)
        .range(from, to),
  );

  const commentary = await pageAll<{ video_id: string; body: string | null }>(async (from, to) =>
    admin.from('song_commentary').select('video_id, body').range(from, to),
  );

  const commentarySongIds = new Set<string>();
  const leftoverVideoIds = new Set<string>();
  for (const row of tidbits) {
    if (!(row.body ?? '').trim()) continue;
    if (row.song_id) commentarySongIds.add(row.song_id);
    else if (row.video_id) leftoverVideoIds.add(row.video_id);
  }
  for (const row of commentary) {
    if (!(row.body ?? '').trim()) continue;
    leftoverVideoIds.add(row.video_id);
  }

  const videoList = [...leftoverVideoIds];
  for (let i = 0; i < videoList.length; i += 200) {
    const chunk = videoList.slice(i, i + 200);
    const { data, error } = await admin.from('song_videos').select('song_id, video_id').in('video_id', chunk);
    if (error && error.code !== '42P01') throw error;
    for (const row of data ?? []) {
      const sid = (row as { song_id?: string }).song_id;
      if (sid) commentarySongIds.add(sid);
    }
  }

  const songs = await pageAll<{
    id: string;
    music8_artist_slug: string | null;
    music8_song_slug: string | null;
  }>(async (from, to) =>
    admin.from('songs').select('id, music8_artist_slug, music8_song_slug').range(from, to),
  );

  const music8SongIds = new Set<string>();
  let missingFile = 0;
  let fileNoIntro = 0;
  let noSlug = 0;
  const dirExists = fs.existsSync(songsDir);

  if (!dirExists) {
    console.warn(`Music8 曲 JSON ディレクトリがありません: ${songsDir}`);
  }

  for (const s of songs) {
    const key = slugKey(s.music8_artist_slug, s.music8_song_slug);
    if (!key) {
      noSlug += 1;
      continue;
    }
    if (!dirExists) continue;
    const file = path.join(songsDir, `${key}.json`);
    if (!fs.existsSync(file)) {
      missingFile += 1;
      continue;
    }
    try {
      const json = JSON.parse(fs.readFileSync(file, 'utf8')) as unknown;
      if (music8JsonHasIntro(json)) music8SongIds.add(s.id);
      else fileNoIntro += 1;
    } catch {
      fileNoIntro += 1;
    }
  }

  let both = 0;
  for (const id of commentarySongIds) {
    if (music8SongIds.has(id)) both += 1;
  }

  const out = {
    total_songs: totalSongs ?? songs.length,
    with_ai_commentary: commentarySongIds.size,
    with_music8_intro: music8SongIds.size,
    with_both: both,
    notes: {
      music8_songs_dir: songsDir,
      songs_without_music8_slug: noSlug,
      slug_but_no_local_json: missingFile,
      local_json_but_no_intro_text: fileNoIntro,
      tidbit_rows_scanned: tidbits.length,
      song_commentary_rows_scanned: commentary.length,
    },
  };
  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
