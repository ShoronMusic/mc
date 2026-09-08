/**
 * WP 曲 JSON（`content`）の本文を HTML 除去して `songs.music8_intro` に載せる。
 *
 * ソース: ローカル Music8 1曲1ファイル（既定 `E:/m8/public/data/songs`）。
 * 結合キー: `music8_song_id`（WP post ID）。
 * `<p>` 等のタグと先頭の「Artist - Title」行は捨てる。クレジット行だけの本文は書かない。
 * 既に `music8_intro` がある行は既定でスキップ（管理画面の Gemini 取得を守る）。
 *
 * 前提: `docs/sql/music8-catalog-extension.sql` の `songs.music8_intro` 列。
 *
 * Usage:
 *   npx tsx scripts/backfill-music8-intro-from-wp-songs-json.ts
 *   npx tsx scripts/backfill-music8-intro-from-wp-songs-json.ts --songs-dir=E:/m8/public/data/songs
 *   npx tsx scripts/backfill-music8-intro-from-wp-songs-json.ts --apply
 *   npx tsx scripts/backfill-music8-intro-from-wp-songs-json.ts --apply --overwrite
 *   npx tsx scripts/backfill-music8-intro-from-wp-songs-json.ts --complete-unmatched
 *   npx tsx scripts/backfill-music8-intro-from-wp-songs-json.ts --complete-unmatched --apply
 */
import fs from 'node:fs';
import path from 'node:path';
import { createAdminClient } from '@/lib/supabase/admin';
import { registerWesternSongFromYoutube } from '@/lib/music8-catalog-register';
import { syncMusic8CatalogTaxonomyFromSongJson } from '@/lib/music8-catalog-sync';
import { looksLikeCreditOnlyIntro, plainMusic8IntroFromWpSongJson } from '@/lib/music8-song-fields';
import { extractYoutubeVideoIdFromWpSongJson } from '@/lib/music8-wp-songs-video-index';
import { attachMusic8SongDataIfFetched } from '@/lib/song-entities';

const DEFAULT_SONGS_DIR = 'E:/m8/public/data/songs';
const LOOKUP_CHUNK = 200;
const UPDATE_CONCURRENCY = 8;

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
    if (!(key in process.env)) process.env[key] = value;
  }
}

function parseArgs(argv: string[]) {
  const args = new Map<string, string>();
  for (const token of argv) {
    if (!token.startsWith('--')) continue;
    const eq = token.indexOf('=');
    if (eq >= 0) args.set(token.slice(2, eq).trim(), token.slice(eq + 1).trim());
    else args.set(token.slice(2).trim(), '1');
  }
  const limitRaw = args.get('limit');
  const limitNum = limitRaw ? Number.parseInt(limitRaw, 10) : NaN;
  const offsetRaw = args.get('offset');
  const offsetNum = offsetRaw ? Number.parseInt(offsetRaw, 10) : NaN;
  const concRaw = args.get('concurrency');
  const concNum = concRaw ? Number.parseInt(concRaw, 10) : NaN;
  return {
    songsDir: args.get('songs-dir')?.trim() || DEFAULT_SONGS_DIR,
    apply: argv.includes('--apply'),
    overwrite: argv.includes('--overwrite'),
    purgeCreditOnly: argv.includes('--purge-credit-only'),
    completeUnmatched: argv.includes('--complete-unmatched'),
    limit: Number.isFinite(limitNum) && limitNum > 0 ? limitNum : null,
    offset: Number.isFinite(offsetNum) && offsetNum >= 0 ? offsetNum : 0,
    concurrency:
      Number.isFinite(concNum) && concNum > 0 ? Math.min(concNum, 24) : UPDATE_CONCURRENCY,
    help: argv.includes('--help') || argv.includes('-h'),
  };
}

function listSongFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => path.join(dir, f));
}

function wpSongIdFromJson(raw: unknown): number | null {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const id = (raw as { id?: unknown }).id;
  const n = typeof id === 'number' ? id : typeof id === 'string' ? Number(id) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

function isMissingIntroColumn(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === '42703') return true;
  return /music8_intro/i.test(error.message ?? '');
}

function printMissingColumnHint(): void {
  console.error(
    'songs.music8_intro 列がありません。Supabase SQL Editor で次を実行してください:\n  alter table public.songs add column if not exists music8_intro text null;',
  );
}

type DbSong = { id: string; intro: string | null };

async function loadSongMap(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  wpIds: number[],
): Promise<Map<number, DbSong>> {
  const map = new Map<number, DbSong>();
  const unique = [...new Set(wpIds)];
  for (let i = 0; i < unique.length; i += LOOKUP_CHUNK) {
    const chunk = unique.slice(i, i + LOOKUP_CHUNK);
    const { data, error } = await admin
      .from('songs')
      .select('id, music8_song_id, music8_intro')
      .in('music8_song_id', chunk);
    if (error) {
      if (isMissingIntroColumn(error)) {
        printMissingColumnHint();
        process.exit(1);
      }
      console.error('[songs lookup]', error.message);
      process.exit(1);
    }
    for (const row of data ?? []) {
      const wpId = Number((row as { music8_song_id?: number }).music8_song_id);
      const id = (row as { id?: string }).id;
      if (!Number.isFinite(wpId) || !id || map.has(wpId)) continue;
      const introRaw = (row as { music8_intro?: string | null }).music8_intro;
      map.set(wpId, {
        id,
        intro: typeof introRaw === 'string' && introRaw.trim() ? introRaw.trim() : null,
      });
    }
    console.log(`[lookup] ${Math.min(i + chunk.length, unique.length)}/${unique.length}`);
  }
  return map;
}

async function mapPool<T>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let next = 0;
  async function worker(): Promise<void> {
    while (true) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      await fn(items[index]!, index);
    }
  }
  const n = Math.max(1, Math.min(concurrency, items.length));
  await Promise.all(Array.from({ length: n }, () => worker()));
}

async function purgeCreditOnlyIntros(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  apply: boolean,
  concurrency: number,
): Promise<void> {
  const PAGE = 500;
  const hits: { id: string; intro: string }[] = [];
  let from = 0;
  let scanned = 0;
  while (true) {
    const to = from + PAGE - 1;
    const { data, error } = await admin
      .from('songs')
      .select('id, music8_intro')
      .not('music8_intro', 'is', null)
      .range(from, to);
    if (error) {
      if (isMissingIntroColumn(error)) {
        printMissingColumnHint();
        process.exit(1);
      }
      console.error('[purge scan]', error.message);
      process.exit(1);
    }
    const rows = data ?? [];
    scanned += rows.length;
    for (const row of rows) {
      const id = (row as { id?: string }).id;
      const intro = String((row as { music8_intro?: string | null }).music8_intro ?? '').trim();
      if (!id || !intro) continue;
      if (looksLikeCreditOnlyIntro(intro)) hits.push({ id, intro });
    }
    console.log(`[purge scan] ${scanned} intros, creditLike=${hits.length}`);
    if (rows.length < PAGE) break;
    from += PAGE;
  }

  console.log('[purge sample]');
  for (const row of hits.slice(0, 8)) {
    console.log(`  ${row.id} ${row.intro.slice(0, 100)}`);
  }

  let cleared = 0;
  let failed = 0;
  if (apply && hits.length > 0) {
    await mapPool(hits, concurrency, async (row) => {
      const { error } = await admin.from('songs').update({ music8_intro: null }).eq('id', row.id);
      if (error) {
        failed += 1;
        console.warn('[purge fail]', row.id, error.message);
        return;
      }
      cleared += 1;
    });
  }
  console.log(
    `[purge done] scanned=${scanned} creditLike=${hits.length} cleared=${cleared} failed=${failed} dryRun=${!apply}`,
  );
}

type AdminClient = NonNullable<ReturnType<typeof createAdminClient>>;

function artistAndTitleFromWpSong(json: unknown): { artist: string; title: string } {
  if (json == null || typeof json !== 'object' || Array.isArray(json)) {
    return { artist: '', title: '' };
  }
  const obj = json as Record<string, unknown>;
  let artist = '';
  const artists = obj.artists;
  if (Array.isArray(artists) && artists[0] && typeof artists[0] === 'object') {
    const n = (artists[0] as { name?: unknown }).name;
    if (typeof n === 'string') artist = n.trim();
  }
  if (!artist && Array.isArray(obj.main_artists) && obj.main_artists[0] && typeof obj.main_artists[0] === 'object') {
    const n = (obj.main_artists[0] as { name?: unknown }).name;
    if (typeof n === 'string') artist = n.trim();
  }
  const title = typeof obj.title === 'string' ? obj.title.trim() : '';
  return { artist, title };
}

type VideoSongHit = { songId: string; intro: string | null; music8SongId: number | null };

async function loadSongsByVideoIds(admin: AdminClient, videoIds: string[]): Promise<Map<string, VideoSongHit>> {
  const byVideo = new Map<string, VideoSongHit>();
  const unique = [...new Set(videoIds.filter(Boolean))];
  const prefer = (vid: string, hit: VideoSongHit) => {
    const cur = byVideo.get(vid);
    if (!cur) {
      byVideo.set(vid, hit);
      return;
    }
    if (cur.intro && !hit.intro) byVideo.set(vid, hit);
  };

  for (let i = 0; i < unique.length; i += 100) {
    const chunk = unique.slice(i, i + 100);
    const { data, error } = await admin
      .from('songs')
      .select('id, music8_song_id, music8_intro, music8_video_id')
      .in('music8_video_id', chunk);
    if (error) {
      console.error('[video lookup songs]', error.message);
      process.exit(1);
    }
    for (const row of data ?? []) {
      const vid = String((row as { music8_video_id?: string }).music8_video_id ?? '').trim();
      const id = String((row as { id?: string }).id ?? '');
      if (!vid || !id) continue;
      const introRaw = (row as { music8_intro?: string | null }).music8_intro;
      prefer(vid, {
        songId: id,
        intro: typeof introRaw === 'string' && introRaw.trim() ? introRaw.trim() : null,
        music8SongId:
          (row as { music8_song_id?: number | null }).music8_song_id == null
            ? null
            : Number((row as { music8_song_id?: number }).music8_song_id),
      });
    }
  }

  for (let i = 0; i < unique.length; i += 100) {
    const chunk = unique.slice(i, i + 100);
    const { data: links, error: linkErr } = await admin
      .from('song_videos')
      .select('song_id, video_id')
      .in('video_id', chunk);
    if (linkErr) {
      console.error('[video lookup song_videos]', linkErr.message);
      process.exit(1);
    }
    const songIds = [
      ...new Set((links ?? []).map((r) => String((r as { song_id?: string }).song_id ?? '')).filter(Boolean)),
    ];
    if (songIds.length === 0) continue;
    const { data: songs, error: sErr } = await admin
      .from('songs')
      .select('id, music8_song_id, music8_intro')
      .in('id', songIds);
    if (sErr) {
      console.error('[video lookup songs by id]', sErr.message);
      process.exit(1);
    }
    const songMap = new Map((songs ?? []).map((s) => [String((s as { id?: string }).id), s]));
    for (const link of links ?? []) {
      const vid = String((link as { video_id?: string }).video_id ?? '').trim();
      const sid = String((link as { song_id?: string }).song_id ?? '');
      const song = songMap.get(sid);
      if (!vid || !song) continue;
      const introRaw = (song as { music8_intro?: string | null }).music8_intro;
      prefer(vid, {
        songId: sid,
        intro: typeof introRaw === 'string' && introRaw.trim() ? introRaw.trim() : null,
        music8SongId:
          (song as { music8_song_id?: number | null }).music8_song_id == null
            ? null
            : Number((song as { music8_song_id?: number }).music8_song_id),
      });
    }
  }
  return byVideo;
}

async function completeUnmatchedIntros(
  admin: AdminClient,
  songsDir: string,
  apply: boolean,
  concurrency: number,
): Promise<void> {
  const files = listSongFiles(songsDir);
  console.log(`[complete-unmatched] dir=${songsDir} files=${files.length} apply=${apply}`);

  type Work = {
    wpId: number;
    file: string;
    json: unknown;
    intro: string;
    videoId: string | null;
    artist: string;
    title: string;
  };
  const withIntro: Work[] = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i]!;
    let json: unknown;
    try {
      json = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      continue;
    }
    const wpId = wpSongIdFromJson(json);
    const intro = plainMusic8IntroFromWpSongJson(json);
    if (wpId == null || !intro) continue;
    const { artist, title } = artistAndTitleFromWpSong(json);
    withIntro.push({
      wpId,
      file,
      json,
      intro,
      videoId: extractYoutubeVideoIdFromWpSongJson(json),
      artist,
      title,
    });
    if ((i + 1) % 4000 === 0 || i + 1 === files.length) {
      console.log(`[parse] ${i + 1}/${files.length} withIntro=${withIntro.length}`);
    }
  }

  const songByWpId = await loadSongMap(
    admin,
    withIntro.map((it) => it.wpId),
  );
  const unmatched = withIntro.filter((it) => !songByWpId.has(it.wpId));
  const videoIds = unmatched.map((it) => it.videoId).filter((v): v is string => !!v);
  const byVideo = await loadSongsByVideoIds(admin, videoIds);

  type Fill = { songId: string; intro: string; file: string; wpId: number; via: string };
  const fill: Fill[] = [];
  const register: Work[] = [];
  let skipHasIntro = 0;
  let stuck = 0;
  const usedSongIds = new Set<string>();

  for (const item of unmatched) {
    const hit = item.videoId ? byVideo.get(item.videoId) : undefined;
    if (hit) {
      if (usedSongIds.has(hit.songId)) continue;
      if (hit.intro) {
        skipHasIntro += 1;
        continue;
      }
      usedSongIds.add(hit.songId);
      fill.push({
        songId: hit.songId,
        intro: item.intro,
        file: item.file,
        wpId: item.wpId,
        via: 'video_id',
      });
      continue;
    }
    if (item.videoId && item.artist && item.title) {
      register.push(item);
      continue;
    }
    stuck += 1;
    console.warn('[stuck]', path.basename(item.file), 'video=', item.videoId, 'artist=', item.artist);
  }

  console.log('[fill sample]');
  for (const row of fill.slice(0, 3)) {
    console.log(`  wp=${row.wpId} ${path.basename(row.file)} → ${row.songId}`);
    console.log(`    ${row.intro.slice(0, 100)}${row.intro.length > 100 ? '…' : ''}`);
  }
  console.log('[register sample]');
  for (const row of register.slice(0, 3)) {
    console.log(
      `  wp=${row.wpId} ${path.basename(row.file)} ${row.artist} - ${row.title} https://www.youtube.com/watch?v=${row.videoId}`,
    );
  }

  let filled = 0;
  let fillFailed = 0;
  if (apply && fill.length > 0) {
    await mapPool(fill, concurrency, async (row) => {
      const { error } = await admin.from('songs').update({ music8_intro: row.intro }).eq('id', row.songId);
      if (error) {
        fillFailed += 1;
        console.warn('[fill fail]', row.wpId, error.message);
        return;
      }
      filled += 1;
    });
  }

  let registered = 0;
  let registerFailed = 0;
  if (apply) {
    for (let i = 0; i < register.length; i++) {
      const item = register[i]!;
      const created = await registerWesternSongFromYoutube(admin, {
        youtubeId: item.videoId!,
        artist: item.artist,
        title: item.title,
        exportJson: false,
      });
      if ('error' in created) {
        registerFailed += 1;
        console.warn('[register fail]', item.wpId, created.error);
        continue;
      }
      try {
        await attachMusic8SongDataIfFetched(admin, created.songId, item.json);
        await syncMusic8CatalogTaxonomyFromSongJson(admin, created.songId, item.json);
      } catch (e) {
        console.warn('[register attach]', item.wpId, e);
      }
      const { data: cur } = await admin
        .from('songs')
        .select('music8_intro')
        .eq('id', created.songId)
        .maybeSingle();
      const existing =
        typeof (cur as { music8_intro?: string | null } | null)?.music8_intro === 'string'
          ? String((cur as { music8_intro: string }).music8_intro).trim()
          : '';
      if (!existing) {
        const { error } = await admin
          .from('songs')
          .update({ music8_intro: item.intro })
          .eq('id', created.songId);
        if (error) {
          registerFailed += 1;
          console.warn('[register intro fail]', item.wpId, error.message);
          continue;
        }
      }
      registered += 1;
      if ((i + 1) % 10 === 0 || i + 1 === register.length) {
        console.log(`[register] ${i + 1}/${register.length} ok=${registered} fail=${registerFailed}`);
      }
    }
  }

  console.log(
    `[done complete-unmatched] unmatched=${unmatched.length} fillViaVideo=${fill.length} skipHasIntro=${skipHasIntro} registerNew=${register.length} stuck=${stuck} filled=${filled} fillFailed=${fillFailed} registered=${registered} registerFailed=${registerFailed} dryRun=${!apply}`,
  );
}

async function main() {
  loadDotEnvLocal();
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log(`Usage:
  npx tsx scripts/backfill-music8-intro-from-wp-songs-json.ts [--songs-dir=<dir>] [--apply] [--overwrite] [--limit=N] [--offset=N]
  npx tsx scripts/backfill-music8-intro-from-wp-songs-json.ts --complete-unmatched [--apply]

WP 曲 JSON の content を HTML 除去し、music8_song_id で結合して songs.music8_intro に載せる。
既定は dry-run。既に intro がある行は --overwrite なしでは触らない。
--purge-credit-only は「Artist - Title」だけの誤書き込みを null に戻す。
--complete-unmatched は music8_song_id 未一致分を YouTube video_id で既存曲へ載せる。DB に無い曲は新規登録する。`);
    process.exit(0);
  }

  const admin = createAdminClient();
  if (!admin) {
    console.error('SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_URL が未設定です。');
    process.exit(1);
  }

  if (opts.purgeCreditOnly) {
    await purgeCreditOnlyIntros(admin, opts.apply, opts.concurrency);
    return;
  }

  const songsDir = path.resolve(opts.songsDir);
  if (!fs.existsSync(songsDir)) {
    console.error(`曲 JSON ディレクトリがありません: ${songsDir}`);
    process.exit(1);
  }

  if (opts.completeUnmatched) {
    await completeUnmatchedIntros(admin, songsDir, opts.apply, opts.concurrency);
    return;
  }

  const probe = await admin.from('songs').select('id, music8_intro').limit(1);
  const columnMissing = isMissingIntroColumn(probe.error);
  if (probe.error && !columnMissing) {
    console.error('[songs probe]', probe.error.message);
    process.exit(1);
  }
  if (columnMissing) {
    printMissingColumnHint();
  }

  const files = listSongFiles(songsDir);
  const slice = files.slice(opts.offset, opts.limit != null ? opts.offset + opts.limit : undefined);
  console.log(
    `[backfill-music8-intro] dir=${songsDir} files=${files.length} offset=${opts.offset} take=${slice.length} apply=${opts.apply} overwrite=${opts.overwrite}`,
  );

  type Item = { wpId: number; file: string; intro: string };
  const items: Item[] = [];
  let parseSkipped = 0;
  let emptyOrCredit = 0;
  for (let i = 0; i < slice.length; i++) {
    const file = slice[i]!;
    let json: unknown;
    try {
      json = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) {
      console.warn('[skip parse]', path.basename(file), e);
      parseSkipped += 1;
      continue;
    }
    const wpId = wpSongIdFromJson(json);
    if (wpId == null) {
      parseSkipped += 1;
      continue;
    }
    const intro = plainMusic8IntroFromWpSongJson(json);
    if (!intro) {
      emptyOrCredit += 1;
    } else {
      items.push({ wpId, file, intro });
    }
    if ((i + 1) % 2000 === 0 || i + 1 === slice.length) {
      console.log(`[parse] ${i + 1}/${slice.length} withIntro=${items.length} emptyOrCredit=${emptyOrCredit}`);
    }
  }

  if (columnMissing) {
    console.log('[sample from JSON]');
    for (const row of items.slice(0, 5)) {
      console.log(`  wp=${row.wpId} ${path.basename(row.file)}`);
      console.log(`    ${row.intro.slice(0, 120)}${row.intro.length > 120 ? '…' : ''}`);
    }
    console.log(
      `[done] jsonWithIntro=${items.length} emptyOrCredit=${emptyOrCredit} parseSkipped=${parseSkipped} dryRun=${!opts.apply} columnMissing=true`,
    );
    process.exit(1);
  }

  const songByWpId = await loadSongMap(
    admin,
    items.map((it) => it.wpId),
  );

  type Planned = { songId: string; wpId: number; intro: string; file: string };
  const planned: Planned[] = [];
  let missing = 0;
  let skipHasIntro = 0;
  for (const item of items) {
    const row = songByWpId.get(item.wpId);
    if (!row) {
      missing += 1;
      continue;
    }
    if (row.intro && !opts.overwrite) {
      skipHasIntro += 1;
      continue;
    }
    if (row.intro === item.intro) continue;
    planned.push({ songId: row.id, wpId: item.wpId, intro: item.intro, file: item.file });
  }

  console.log('[sample]');
  for (const row of planned.slice(0, 5)) {
    console.log(`  wp=${row.wpId} ${path.basename(row.file)}`);
    console.log(`    ${row.intro.slice(0, 120)}${row.intro.length > 120 ? '…' : ''}`);
  }

  let applied = 0;
  let failed = 0;
  if (opts.apply && planned.length > 0) {
    await mapPool(planned, opts.concurrency, async (row) => {
      const { error } = await admin.from('songs').update({ music8_intro: row.intro }).eq('id', row.songId);
      if (error) {
        if (isMissingIntroColumn(error)) {
          printMissingColumnHint();
          process.exit(1);
        }
        failed += 1;
        console.warn('[update fail]', row.wpId, error.message);
        return;
      }
      applied += 1;
      if (applied % 200 === 0) {
        console.log(`[progress] applied=${applied}/${planned.length} failed=${failed}`);
      }
    });
  }

  console.log(
    `[done] jsonWithIntro=${items.length} emptyOrCredit=${emptyOrCredit} parseSkipped=${parseSkipped} missing_song=${missing} skip_has_intro=${skipHasIntro} would_write=${planned.length} applied=${applied} failed=${failed} dryRun=${!opts.apply}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
