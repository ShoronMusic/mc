/**
 * spotify_popularity 未設定の songs を Spotify API で補完（100 曲ずつ推奨）。
 *
 * - 既存 spotify_track_id あり → GET /v1/tracks/{id} で popularity 等
 * - なし → display_title を `Artist - Title` に分割して search（失敗時 main_artist+song_title、最後に全文検索）
 *
 * Usage (dry-run が既定):
 *   npx tsx scripts/backfill-songs-spotify-metadata.ts --limit=100 --offset=0
 *   npx tsx scripts/backfill-songs-spotify-metadata.ts --apply --limit=100 --offset=0
 *
 * 全件目安: 2972 曲 × 約 0.4s ≈ 20 分（--delay-ms=400）。100 曲ずつなら offset を 0,100,200…
 *
 * Requires .env.local:
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET
 *   任意 SPOTIFY_MARKET=US
 */
import fs from 'node:fs';
import path from 'node:path';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  fetchSpotifyTrackByArtistTitle,
  fetchSpotifyTrackByFreeTextQuery,
  fetchSpotifyTrackById,
  getSpotifyAccessToken,
  parseArtistTitleFromDisplayTitle,
} from '@/lib/spotify-search-track';

type SongCandidate = {
  id: string;
  main_artist: string;
  song_title: string;
  display_title: string;
  spotify_track_id: string | null;
  spotify_popularity: number | null;
};

type ResultRow = {
  songId: string;
  display_title: string;
  status: 'ok' | 'no_match' | 'no_token' | 'error';
  message?: string;
  spotify_track_id?: string;
  spotify_popularity?: number;
};

function loadDotEnvLocal(): void {
  const p = path.resolve(process.cwd(), '.env.local');
  if (!fs.existsSync(p)) return;
  const txt = fs.readFileSync(p, 'utf8');
  for (const raw of txt.split(/\r?\n/)) {
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

function parseArgs(argv: string[]) {
  const args = new Map<string, string>();
  for (const token of argv) {
    if (!token.startsWith('--')) continue;
    const eq = token.indexOf('=');
    if (eq >= 0) args.set(token.slice(2, eq), token.slice(eq + 1));
    else args.set(token.slice(2), '1');
  }
  return {
    apply: argv.includes('--apply'),
    limit: Math.max(1, Math.min(500, Number(args.get('limit') || '100') || 100)),
    offset: Math.max(0, Number(args.get('offset') || '0') || 0),
    delayMs: Math.max(0, Number(args.get('delay-ms') || '400') || 400),
    logPath:
      args.get('log')?.trim() ||
      path.resolve(process.cwd(), 'tmp', `spotify-backfill-${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`),
    help: argv.includes('--help') || argv.includes('-h'),
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchCandidates(limit: number, offset: number): Promise<SongCandidate[]> {
  const supabase = createAdminClient();
  if (!supabase) throw new Error('createAdminClient failed');
  const { data, error } = await supabase
    .from('songs')
    .select('id, main_artist, song_title, display_title, spotify_track_id, spotify_popularity')
    .is('spotify_popularity', null)
    .order('display_title', { ascending: true })
    .range(offset, offset + limit - 1);
  if (error) throw new Error(`${error.code ?? ''} ${error.message}`);
  return (data ?? []) as SongCandidate[];
}

async function resolveSpotifyMeta(row: SongCandidate): Promise<{
  meta: Awaited<ReturnType<typeof fetchSpotifyTrackByArtistTitle>>;
  via: string;
}> {
  const existingId = row.spotify_track_id?.trim();
  if (existingId) {
    const meta = await fetchSpotifyTrackById(existingId);
    return { meta, via: 'track_id' };
  }

  const fromDisplay = parseArtistTitleFromDisplayTitle(row.display_title);
  if (fromDisplay) {
    const meta = await fetchSpotifyTrackByArtistTitle(fromDisplay.artist, fromDisplay.title);
    if (meta.spotifyTrackId) return { meta, via: 'display_title_parsed' };
  }

  const ma = row.main_artist?.trim();
  const st = row.song_title?.trim();
  if (ma && st) {
    const meta = await fetchSpotifyTrackByArtistTitle(ma, st);
    if (meta.spotifyTrackId) return { meta, via: 'main_artist_song_title' };
  }

  const meta = await fetchSpotifyTrackByFreeTextQuery(row.display_title.trim());
  return { meta, via: 'display_title_free_text' };
}

function buildUpdatePayload(
  row: SongCandidate,
  meta: Awaited<ReturnType<typeof fetchSpotifyTrackByArtistTitle>>,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  const existingTrack = row.spotify_track_id?.trim();
  if (!existingTrack && meta.spotifyTrackId) payload.spotify_track_id = meta.spotifyTrackId;
  if (row.spotify_popularity == null && meta.spotifyPopularity != null) {
    payload.spotify_popularity = Math.max(0, Math.min(100, Math.round(meta.spotifyPopularity)));
  }
  if (meta.spotifyName) payload.spotify_name = meta.spotifyName;
  if (meta.spotifyArtists) payload.spotify_artists = meta.spotifyArtists;
  if (meta.spotifyReleaseDate) payload.spotify_release_date = meta.spotifyReleaseDate;
  return payload;
}

async function main(): Promise<void> {
  loadDotEnvLocal();
  const { apply, limit, offset, delayMs, logPath, help } = parseArgs(process.argv.slice(2));
  if (help) {
    console.log(`Usage:
  npx tsx scripts/backfill-songs-spotify-metadata.ts [--limit=100] [--offset=0] [--delay-ms=400]
  npx tsx scripts/backfill-songs-spotify-metadata.ts --apply [--limit=100] [--offset=0]

Dry-run by default. Targets songs where spotify_popularity IS NULL.

重要: 反映済み行は対象外になるため、続きは --offset=0 のまま繰り返す（100,200…と増やすと取りこぼし）。`);
    return;
  }

  const token = await getSpotifyAccessToken();
  if (!token) {
    console.error('SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET が無効か未設定です。');
    process.exit(1);
  }

  const rows = await fetchCandidates(limit, offset);
  console.log(`mode=${apply ? 'apply' : 'dry-run'} offset=${offset} limit=${limit} candidates=${rows.length}`);

  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  const logStream = fs.createWriteStream(logPath, { flags: 'a', encoding: 'utf8' });

  let ok = 0;
  let noMatch = 0;
  let err = 0;

  const supabase = createAdminClient();
  if (!supabase) {
    console.error('createAdminClient failed');
    process.exit(1);
  }

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    let result: ResultRow;
    try {
      const { meta, via } = await resolveSpotifyMeta(row);
      const payload = buildUpdatePayload(row, meta);
      const hasPop =
        typeof meta.spotifyPopularity === 'number' && Number.isFinite(meta.spotifyPopularity);

      if (!meta.spotifyTrackId && !hasPop) {
        noMatch++;
        result = { songId: row.id, display_title: row.display_title, status: 'no_match', message: via };
        logStream.write(JSON.stringify(result) + '\n');
        console.log(`[${i + 1}/${rows.length}] no_match ${row.display_title} (${via})`);
      } else if (Object.keys(payload).length === 0) {
        noMatch++;
        result = { songId: row.id, display_title: row.display_title, status: 'no_match', message: `${via}:empty_payload` };
        logStream.write(JSON.stringify(result) + '\n');
        console.log(`[${i + 1}/${rows.length}] skip ${row.display_title} (nothing to write)`);
      } else {
        ok++;
        result = {
          songId: row.id,
          display_title: row.display_title,
          status: 'ok',
          spotify_track_id: meta.spotifyTrackId ?? undefined,
          spotify_popularity: hasPop ? Math.round(meta.spotifyPopularity!) : undefined,
          message: via,
        };
        logStream.write(JSON.stringify({ ...result, payload }) + '\n');
        console.log(
          `[${i + 1}/${rows.length}] ok ${row.display_title} -> ${meta.spotifyTrackId ?? '(id kept)'} pop=${meta.spotifyPopularity ?? '—'} (${via})`,
        );
        if (apply) {
          const { error } = await supabase.from('songs').update(payload).eq('id', row.id);
          if (error) {
            err++;
            ok--;
            result = { songId: row.id, display_title: row.display_title, status: 'error', message: error.message };
            console.log(`  DB error: ${error.message}`);
          }
        }
      }
    } catch (e) {
      err++;
      result = {
        songId: row.id,
        display_title: row.display_title,
        status: 'error',
        message: e instanceof Error ? e.message : String(e),
      };
      logStream.write(JSON.stringify(result) + '\n');
    }

    if (delayMs > 0 && i < rows.length - 1) await sleep(delayMs);
  }

  logStream.end();
  console.log(`done ok=${ok} no_match=${noMatch} err=${err} log=${logPath}`);
  if (rows.length === limit) {
    console.log(
      `次のバッチ例: --offset=0 --limit=${limit}${apply ? ' --apply' : ''}  ※未設定行だけが対象のため offset は常に 0 でよい`,
    );
  } else if (rows.length > 0) {
    console.log('残りは --offset=0 で再実行するか、件数が limit 未満なら完了に近いです。');
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
