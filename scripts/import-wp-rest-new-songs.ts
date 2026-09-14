/**
 * WP 単独登録の曲を MC（Supabase）へ新登録曲として取り込む。
 * 公開 JSON 生成前でも WP REST から取得できる。
 *
 * Usage:
 *   npx tsx scripts/import-wp-rest-new-songs.ts --after=2026-09-11 --before=2026-09-12
 *   npx tsx scripts/import-wp-rest-new-songs.ts --after=2026-09-11 --before=2026-09-12 --apply
 *   npx tsx scripts/import-wp-rest-new-songs.ts --ids=140383,140378 --apply
 */
import fs from 'node:fs';
import path from 'node:path';
import { createAdminClient } from '@/lib/supabase/admin';
import { registerWesternSongFromYoutube } from '@/lib/music8-catalog-register';
import { music8NavStyleSlugFromStyleIds } from '@/lib/music8-catalog-slugs';
import { syncMusic8CatalogTaxonomyFromSongJson } from '@/lib/music8-catalog-sync';
import { extractMusic8SongFields, plainMusic8IntroFromWpSongJson } from '@/lib/music8-song-fields';
import {
  displayArtistNameFromWpRestSongJson,
  getMusic8WpRestBaseUrl,
  wpRestPostToMusic8SongJson,
  type WpRestSongPost,
} from '@/lib/music8-wp-rest';
import { attachMusic8SongDataIfFetched } from '@/lib/song-entities';

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
  const idsRaw = args.get('ids')?.trim() ?? '';
  const ids = idsRaw
    ? idsRaw
        .split(/[,\s]+/)
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isFinite(n) && n > 0)
    : [];
  return {
    after: args.get('after')?.trim() || '',
    before: args.get('before')?.trim() || '',
    ids,
    apply: argv.includes('--apply'),
    skipExport: argv.includes('--skip-export'),
    help: argv.includes('--help') || argv.includes('-h'),
  };
}

/** `YYYY-MM-DD` を JST 0:00 の ISO（UTC）にする。時刻付きならそのまま Date.parse。 */
function parseBoundaryIso(raw: string, kind: 'start' | 'end'): string | null {
  const s = raw.trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const t = Date.parse(`${s}T${kind === 'start' ? '00:00:00' : '00:00:00'}+09:00`);
    if (!Number.isFinite(t)) return null;
    if (kind === 'end') return new Date(t).toISOString();
    return new Date(t).toISOString();
  }
  const t = Date.parse(s);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCharCode(Number.parseInt(n, 16)))
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .trim();
}

function artistAndTitleFromConverted(json: Record<string, unknown>): { artist: string; title: string } {
  const artist = displayArtistNameFromWpRestSongJson(json);
  const titleRaw = typeof json.title === 'string' ? json.title : '';
  return { artist, title: decodeHtmlEntities(titleRaw) };
}

function catalogPublishedAtIso(post: WpRestSongPost): string | null {
  const gmt = typeof post.date_gmt === 'string' ? post.date_gmt.trim() : '';
  if (gmt) {
    const iso = gmt.endsWith('Z') ? gmt : `${gmt}Z`;
    const t = Date.parse(iso);
    if (Number.isFinite(t)) return new Date(t).toISOString();
  }
  const local = typeof post.date === 'string' ? post.date.trim() : '';
  if (!local) return null;
  const t = Date.parse(`${local}+09:00`);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

async function fetchWpJson<T>(url: string): Promise<{ data: T | null; totalPages: number }> {
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'musicaichat-admin/1.0',
    },
    signal: AbortSignal.timeout(20_000),
    cache: 'no-store',
  });
  if (!res.ok) {
    console.warn(`[wp] ${res.status} ${url}`);
    return { data: null, totalPages: 0 };
  }
  const totalPagesRaw = Number.parseInt(res.headers.get('X-WP-TotalPages') ?? '1', 10);
  const totalPages = Number.isFinite(totalPagesRaw) && totalPagesRaw > 0 ? totalPagesRaw : 1;
  return { data: (await res.json()) as T, totalPages };
}

async function fetchPostsByIds(base: string, ids: number[]): Promise<WpRestSongPost[]> {
  const out: WpRestSongPost[] = [];
  for (const id of ids) {
    const { data } = await fetchWpJson<WpRestSongPost>(`${base}/wp/v2/posts/${id}`);
    if (data?.id) out.push(data);
    else console.warn(`[wp] post ${id} not found`);
  }
  return out;
}

async function fetchPostsInWindow(base: string, afterIso: string, beforeIso: string): Promise<WpRestSongPost[]> {
  const out: WpRestSongPost[] = [];
  const params = new URLSearchParams({
    after: afterIso,
    before: beforeIso,
    per_page: '50',
    orderby: 'date',
    order: 'asc',
    status: 'publish',
  });
  for (let page = 1; page <= 20; page++) {
    params.set('page', String(page));
    const { data, totalPages } = await fetchWpJson<WpRestSongPost[]>(
      `${base}/wp/v2/posts?${params.toString()}`,
    );
    const rows = Array.isArray(data) ? data.filter((p) => p?.id) : [];
    out.push(...rows);
    console.log(`[wp] page ${page}/${totalPages} got=${rows.length} total=${out.length}`);
    if (rows.length === 0 || page >= totalPages) break;
  }
  return out;
}

type ExistingHit = {
  songId: string;
  music8SongId: number | null;
  createdAt: string | null;
  via: 'music8_song_id' | 'video_id';
};

async function lookupExisting(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  wpId: number,
  videoId: string,
): Promise<ExistingHit | null> {
  const { data: byWp, error: wpErr } = await admin
    .from('songs')
    .select('id, music8_song_id, created_at')
    .eq('music8_song_id', wpId)
    .maybeSingle();
  if (wpErr && wpErr.code !== 'PGRST116') {
    console.warn('[lookup music8_song_id]', wpId, wpErr.message);
  }
  if (byWp && typeof (byWp as { id?: string }).id === 'string') {
    const row = byWp as { id: string; music8_song_id?: number | null; created_at?: string | null };
    return {
      songId: row.id,
      music8SongId: typeof row.music8_song_id === 'number' ? row.music8_song_id : null,
      createdAt: row.created_at ?? null,
      via: 'music8_song_id',
    };
  }
  if (!videoId) return null;

  const { data: byVideoCol } = await admin
    .from('songs')
    .select('id, music8_song_id, created_at')
    .eq('music8_video_id', videoId)
    .maybeSingle();
  if (byVideoCol && typeof (byVideoCol as { id?: string }).id === 'string') {
    const row = byVideoCol as { id: string; music8_song_id?: number | null; created_at?: string | null };
    return {
      songId: row.id,
      music8SongId: typeof row.music8_song_id === 'number' ? row.music8_song_id : null,
      createdAt: row.created_at ?? null,
      via: 'video_id',
    };
  }

  const { data: vidRow } = await admin
    .from('song_videos')
    .select('song_id')
    .eq('video_id', videoId)
    .maybeSingle();
  const sid = (vidRow as { song_id?: string } | null)?.song_id;
  if (!sid) return null;
  const { data: song } = await admin
    .from('songs')
    .select('id, music8_song_id, created_at')
    .eq('id', sid)
    .maybeSingle();
  if (!song || typeof (song as { id?: string }).id !== 'string') return null;
  const row = song as { id: string; music8_song_id?: number | null; created_at?: string | null };
  return {
    songId: row.id,
    music8SongId: typeof row.music8_song_id === 'number' ? row.music8_song_id : null,
    createdAt: row.created_at ?? null,
    via: 'video_id',
  };
}

async function enrichExistingSong(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  songId: string,
  json: Record<string, unknown>,
  publishedAt: string | null,
): Promise<void> {
  await attachMusic8SongDataIfFetched(admin, songId, json);
  await syncMusic8CatalogTaxonomyFromSongJson(admin, songId, json);
  const intro = plainMusic8IntroFromWpSongJson(json);
  const { data: cur } = await admin
    .from('songs')
    .select('music8_intro, catalog_published_at')
    .eq('id', songId)
    .maybeSingle();
  const patch: Record<string, unknown> = {};
  const existingIntro =
    typeof (cur as { music8_intro?: string | null } | null)?.music8_intro === 'string'
      ? String((cur as { music8_intro: string }).music8_intro).trim()
      : '';
  if (intro && !existingIntro) patch.music8_intro = intro;
  const existingPublished =
    typeof (cur as { catalog_published_at?: string | null } | null)?.catalog_published_at === 'string'
      ? String((cur as { catalog_published_at: string }).catalog_published_at).trim()
      : '';
  if (publishedAt && !existingPublished) patch.catalog_published_at = publishedAt;
  if (Object.keys(patch).length > 0) {
    const { error } = await admin.from('songs').update(patch).eq('id', songId);
    if (error) console.warn('[enrich update]', songId, error.message);
  }
}

async function main() {
  loadDotEnvLocal();
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help || (opts.ids.length === 0 && (!opts.after || !opts.before))) {
    console.log(`Usage:
  npx tsx scripts/import-wp-rest-new-songs.ts --after=YYYY-MM-DD --before=YYYY-MM-DD [--apply]
  npx tsx scripts/import-wp-rest-new-songs.ts --ids=140383,140378 [--apply]

--after / --before は JST の日付（before はその日の 0:00 未満 = 前日まで）。
既定は dry-run。`);
    process.exit(opts.help ? 0 : 1);
  }

  const base = getMusic8WpRestBaseUrl();
  if (!base) {
    console.error('MUSIC8_WP_REST_BASE_URL が無効です。');
    process.exit(1);
  }
  const admin = createAdminClient();
  if (!admin) {
    console.error('SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_URL が未設定です。');
    process.exit(1);
  }

  let posts: WpRestSongPost[] = [];
  if (opts.ids.length > 0) {
    posts = await fetchPostsByIds(base, opts.ids);
  } else {
    const afterIso = parseBoundaryIso(opts.after, 'start');
    const beforeIso = parseBoundaryIso(opts.before, 'end');
    if (!afterIso || !beforeIso) {
      console.error('after / before を YYYY-MM-DD（または ISO）で指定してください。');
      process.exit(1);
    }
    console.log(`[window] after=${afterIso} before=${beforeIso} (exclusive)`);
    posts = await fetchPostsInWindow(base, afterIso, beforeIso);
  }
  console.log(`[import-wp-rest-new-songs] posts=${posts.length} apply=${opts.apply}`);

  let wouldRegister = 0;
  let wouldEnrich = 0;
  let skippedLinked = 0;
  let stuck = 0;
  let registered = 0;
  let enriched = 0;
  let failed = 0;

  for (const post of posts) {
    const json = wpRestPostToMusic8SongJson(post);
    const { artist, title } = artistAndTitleFromConverted(json);
    const videoId = typeof json.videoId === 'string' ? json.videoId.trim() : '';
    const extracted = extractMusic8SongFields(json);
    const styleSlug = music8NavStyleSlugFromStyleIds(extracted.styleIds);
    const publishedAt = catalogPublishedAtIso(post);
    const existing = await lookupExisting(admin, post.id, videoId);
    const label = `wp=${post.id} ${artist} - ${title} yt=${videoId || '-'} style=${styleSlug ?? '-'}`;

    if (!videoId || !artist || !title) {
      stuck += 1;
      console.warn(`[stuck] ${label}`);
      continue;
    }

    if (existing?.via === 'music8_song_id') {
      skippedLinked += 1;
      console.log(`[already] ${label} song=${existing.songId} created_at=${existing.createdAt ?? '-'}`);
      continue;
    }

    if (existing) {
      wouldEnrich += 1;
      console.log(
        `[enrich] ${label} song=${existing.songId} created_at=${existing.createdAt ?? '-'} (video 既存・WP ID 未紐付け)`,
      );
      if (!opts.apply) continue;
      try {
        await enrichExistingSong(admin, existing.songId, json, publishedAt);
        enriched += 1;
      } catch (e) {
        failed += 1;
        console.warn('[enrich fail]', post.id, e);
      }
      continue;
    }

    wouldRegister += 1;
    console.log(`[new] ${label} wp_date=${post.date ?? '-'}`);
    if (!opts.apply) continue;

    const created = await registerWesternSongFromYoutube(admin, {
      youtubeId: videoId,
      artist,
      title,
      styleSlug,
      catalogScope: 'western',
      exportJson: !opts.skipExport,
    });
    if ('error' in created) {
      failed += 1;
      console.warn('[register fail]', post.id, created.error);
      continue;
    }
    try {
      await enrichExistingSong(admin, created.songId, json, publishedAt);
    } catch (e) {
      console.warn('[register attach]', post.id, e);
    }
    registered += 1;
    console.log(`[registered] wp=${post.id} song=${created.songId} export=${created.exportPath ?? '-'}`);
  }

  console.log(
    `[done] posts=${posts.length} new=${wouldRegister} enrich=${wouldEnrich} already=${skippedLinked} stuck=${stuck} registered=${registered} enriched=${enriched} failed=${failed} dryRun=${!opts.apply}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
