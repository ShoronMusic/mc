/**
 * YouTube プレイリスト → 邦楽曲 DB シード（確認用 JSON 経由）
 *
 * 1) fetch … プレイリストから JSON v2（最小項目）を生成
 * 2) normalize（任意・v1 のみ）/ 人手で artist / title / releaseDate / include を編集
 * 3) compact … 旧 v1 JSON を v2 に圧縮（既に v2 なら不要）
 * 4) enrich … v2 JSON に YouTube 日（任意で MB 原盤日）を API 補完
 * 5) apply … MC 邦楽ライト DB へ投入
 *
 * 必要 env（`.env.local`）: `YOUTUBE_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `MUSICBRAINZ_USER_AGENT`
 *
 * Usage:
 *   npx tsx scripts/domestic-playlist-seed.ts fetch \
 *     --playlist-url="https://www.youtube.com/playlist?list=PL..." \
 *     --out=tmp/domestic-seed-dct.json
 *
 *   npx tsx scripts/domestic-playlist-seed.ts apply --in=tmp/domestic-seed-dct.json --dry-run
 *   npx tsx scripts/domestic-playlist-seed.ts apply --in=tmp/domestic-seed-dct.json
 *
 * fetch options:
 *   --playlist-id=PLxxx  / --playlist-url=...
 *   --out=path.json      出力先（必須）
 *   --max-items=N        先頭 N 件だけ
 *
 * apply options:
 *   --in=path.json       入力 JSON（必須）
 *   --dry-run            DB 書き込みなし
 *   --force-allow        公式ゲートを bypass（手動承認済みの seed 用。鉤括弧タイトル等でゲートが jp_unofficial になる場合に使用）
 *   --no-skip-existing   既存 video_id も再 upsert
 */
import fs from 'node:fs';
import path from 'node:path';
import { createAdminClient } from '@/lib/supabase/admin';
import { resolveDomesticSongMetadataForRegistration } from '@/lib/domestic-song-registration';
import { latinArtistSlugHintFromChannel } from '@/lib/jp-domestic-youtube-title';
import {
  buildSongDbRegistrationInput,
  shouldPersistVideoToSongDatabase,
} from '@/lib/song-db-registration-gate';
import {
  joinMyListArtistsForStorage,
  suggestMyListArtistTitleFromYoutubeStyle,
} from '@/lib/my-list-youtube-title-suggest';
import { resolveSongCatalogScope } from '@/lib/song-catalog-scope';
import { upsertSongAndVideo } from '@/lib/song-entities';
import { resolveArtistSongForPackAsync } from '@/lib/youtube-artist-song-for-pack';
import { fetchOEmbed } from '@/lib/youtube-oembed';
import { getVideoSnippet } from '@/lib/youtube-search';

const SCHEMA_VERSION = 2;

/** v2: 確認・投入用（原盤日と YouTube 日を別項目） */
type DomesticSeedItemV2 = {
  videoId: string;
  artist: string;
  title: string;
  /** 原盤公開日 YYYY-MM-DD（MusicBrainz） */
  releaseDate?: string | null;
  /** YouTube 動画公開日 YYYY-MM-DD */
  youtubeDate?: string | null;
  include: boolean;
  note?: string | null;
  /** apply 実行後に付与 */
  status?: string | null;
  songId?: string | null;
};

type DomesticSeedDocV2 = {
  schemaVersion: 2;
  playlistId: string;
  playlistUrl: string;
  items: DomesticSeedItemV2[];
};

/** v1 互換（compact 前の旧 JSON） */
type DomesticSeedItemV1 = {
  index?: number;
  videoId: string;
  url?: string;
  rawTitle?: string;
  channelTitle?: string | null;
  channelId?: string | null;
  artist: string;
  title: string;
  displayTitle?: string;
  originalReleaseDate?: string | null;
  genres?: string[];
  metadataSource?: string | null;
  musicBrainzScore?: number | null;
  youtubePublishedAt?: string | null;
  officialGate?: { persist: boolean; reason: string };
  include: boolean;
  notes?: string | null;
  applyStatus?: string | null;
  applyError?: string | null;
  songId?: string | null;
};

type DomesticSeedDocV1 = {
  schemaVersion: 1;
  playlistUrl?: string;
  playlistId?: string;
  fetchedAt?: string;
  summary?: Record<string, unknown>;
  items: DomesticSeedItemV1[];
};

type SeedItemWorking = {
  videoId: string;
  artist: string;
  title: string;
  originalReleaseDate: string | null;
  include: boolean;
  note: string | null;
  rawTitle: string | null;
  channelTitle: string | null;
  channelId: string | null;
  displayTitle: string;
  genres: string[];
  youtubePublishedAt: string | null;
  applyStatus: string | null;
  applyError: string | null;
  songId: string | null;
};

type ParsedSeedDoc = {
  schemaVersion: 1 | 2;
  playlistId: string;
  playlistUrl: string;
  items: SeedItemWorking[];
};

type PlaylistRow = {
  videoId: string;
  rawTitle: string;
  channelTitle: string;
  ownerChannel: string;
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
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function parseArgs(argv: string[]): Map<string, string> {
  const args = new Map<string, string>();
  for (const token of argv) {
    if (!token.startsWith('--')) continue;
    const eq = token.indexOf('=');
    if (eq >= 0) args.set(token.slice(2, eq), token.slice(eq + 1));
    else args.set(token.slice(2), '1');
  }
  return args;
}

function hasFlag(argv: string[], name: string): boolean {
  return argv.includes(`--${name}`);
}

function parsePlaylistId(playlistUrl: string, playlistIdRaw: string): string | null {
  if (playlistIdRaw.trim()) return playlistIdRaw.trim();
  if (!playlistUrl.trim()) return null;
  try {
    return new URL(playlistUrl).searchParams.get('list')?.trim() ?? null;
  } catch {
    return null;
  }
}

function buildPlaylistUrl(playlistId: string): string {
  return `https://www.youtube.com/playlist?list=${encodeURIComponent(playlistId)}`;
}

function parsePositiveIntOrNull(v: string | undefined): number | null {
  if (!v?.trim()) return null;
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

async function fetchPlaylistRows(playlistId: string, maxItems: number | null): Promise<PlaylistRow[]> {
  const apiKey = process.env.YOUTUBE_API_KEY?.trim();
  if (!apiKey) throw new Error('YOUTUBE_API_KEY が未設定です。');

  const rows: PlaylistRow[] = [];
  let nextPageToken: string | null = null;
  while (true) {
    const params = new URLSearchParams({
      part: 'snippet,contentDetails',
      playlistId,
      maxResults: '50',
      key: apiKey,
    });
    if (nextPageToken) params.set('pageToken', nextPageToken);
    const res = await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?${params.toString()}`, {
      cache: 'no-store',
    });
    const data = (await res.json()) as {
      error?: { message?: string };
      nextPageToken?: string;
      items?: Array<{
        snippet?: {
          title?: string;
          channelTitle?: string;
          videoOwnerChannelTitle?: string;
        };
        contentDetails?: { videoId?: string };
      }>;
    };
    if (!res.ok || data.error) {
      throw new Error(data.error?.message ?? `YouTube playlistItems HTTP ${res.status}`);
    }
    for (const item of data.items ?? []) {
      const videoId = item.contentDetails?.videoId?.trim();
      if (!videoId) continue;
      rows.push({
        videoId,
        rawTitle: item.snippet?.title?.trim() ?? '',
        channelTitle: item.snippet?.channelTitle?.trim() ?? '',
        ownerChannel: item.snippet?.videoOwnerChannelTitle?.trim() ?? '',
      });
      if (maxItems && rows.length >= maxItems) return rows;
    }
    nextPageToken = data.nextPageToken?.trim() || null;
    if (!nextPageToken) break;
  }
  return rows;
}

function isoToDateOnly(iso: string | null | undefined): string | null {
  if (!iso?.trim()) return null;
  const d = iso.trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
}

function dateOnlyToIso(isoDate: string | null | undefined): string | null {
  const d = isoToDateOnly(isoDate);
  if (!d) return null;
  const ms = Date.parse(`${d}T00:00:00.000Z`);
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toISOString();
}

function buildDisplayTitle(artist: string, title: string): string {
  return `${artist.trim()} - ${title.trim()}`;
}

function workingToV2(item: SeedItemWorking): DomesticSeedItemV2 {
  const out: DomesticSeedItemV2 = {
    videoId: item.videoId,
    artist: item.artist,
    title: item.title,
    include: item.include,
  };
  if (item.originalReleaseDate) out.releaseDate = item.originalReleaseDate;
  const ytDate = isoToDateOnly(item.youtubePublishedAt);
  if (ytDate) out.youtubeDate = ytDate;
  if (item.note) out.note = item.note;
  if (item.applyStatus) out.status = item.applyStatus;
  if (item.songId) out.songId = item.songId;
  return out;
}

function v1ItemToWorking(item: DomesticSeedItemV1): SeedItemWorking {
  const artist = item.artist.trim();
  const title = item.title.trim();
  return {
    videoId: item.videoId.trim(),
    artist,
    title,
    originalReleaseDate: item.originalReleaseDate ?? null,
    include: item.include !== false,
    note: item.notes ?? null,
    rawTitle: item.rawTitle ?? null,
    channelTitle: item.channelTitle ?? null,
    channelId: item.channelId ?? null,
    displayTitle: item.displayTitle?.trim() || buildDisplayTitle(artist, title),
    genres: Array.isArray(item.genres) ? item.genres : [],
    youtubePublishedAt: item.youtubePublishedAt ?? null,
    applyStatus: item.applyStatus ?? null,
    applyError: item.applyError ?? null,
    songId: item.songId ?? null,
  };
}

function v2ItemToWorking(item: DomesticSeedItemV2): SeedItemWorking {
  const artist = item.artist.trim();
  const title = item.title.trim();
  return {
    videoId: item.videoId.trim(),
    artist,
    title,
    originalReleaseDate: item.releaseDate ?? null,
    include: item.include !== false,
    note: item.note ?? null,
    rawTitle: null,
    channelTitle: null,
    channelId: null,
    displayTitle: buildDisplayTitle(artist, title),
    genres: [],
    youtubePublishedAt: dateOnlyToIso(item.youtubeDate) ?? null,
    applyStatus: item.status ?? null,
    applyError: null,
    songId: item.songId ?? null,
  };
}

function writeSeedDocV2(path: string, doc: ParsedSeedDoc): void {
  const payload: DomesticSeedDocV2 = {
    schemaVersion: 2,
    playlistId: doc.playlistId,
    playlistUrl: doc.playlistUrl,
    items: doc.items.map(workingToV2),
  };
  fs.writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function printSeedSummary(items: SeedItemWorking[]): void {
  const included = items.filter((i) => i.include).length;
  const withRelease = items.filter((i) => i.originalReleaseDate).length;
  const withYoutube = items.filter((i) => isoToDateOnly(i.youtubePublishedAt)).length;
  console.error(`  全 ${items.length} 件 / 原盤日(MB) ${withRelease} / YouTube日 ${withYoutube} / include ${included}`);
}

function buildSummary(items: SeedItemWorking[]): {
  total: number;
  withReleaseDate: number;
  withYoutubeDate: number;
  included: number;
} {
  return {
    total: items.length,
    withReleaseDate: items.filter((i) => i.originalReleaseDate).length,
    withYoutubeDate: items.filter((i) => isoToDateOnly(i.youtubePublishedAt)).length,
    included: items.filter((i) => i.include).length,
  };
}

function reviewHintForItem(item: {
  channelTitle: string | null;
  artist: string;
  rawTitle: string;
  gatePersist: boolean;
}): string | null {
  if (item.gatePersist) return null;
  const ch = (item.channelTitle ?? '').trim().toLowerCase();
  const ar = item.artist.trim().toLowerCase();
  if (ch && ar && (ch === ar || ch.startsWith(ar) || ar.startsWith(ch))) {
    return 'チャンネル名とアーティスト一致。公式チャンネルMVの可能性が高い → 確認後 include:true、apply は --force-allow';
  }
  if (/\bMV\b/u.test(item.rawTitle) || /」\s*MV/u.test(item.rawTitle)) {
    return 'MV表記あり。内容確認後 include を検討';
  }
  return null;
}

async function resolveItemMetadata(
  row: PlaylistRow,
): Promise<SeedItemWorking> {
  const artistHint = row.ownerChannel || row.channelTitle;
  const oembed = await fetchOEmbed(row.videoId).catch(() => null);
  const snippet = await getVideoSnippet(row.videoId, { source: 'domestic-playlist-seed' });
  const rawTitle = snippet?.title?.trim() || row.rawTitle || row.videoId;
  const channelTitle = snippet?.channelTitle?.trim() || row.channelTitle || null;
  const authorName = oembed?.author_name?.trim() || null;

  const resolved = await resolveArtistSongForPackAsync(
    rawTitle,
    authorName,
    snippet,
    row.videoId,
  );

  const suggested = suggestMyListArtistTitleFromYoutubeStyle(artistHint || null, rawTitle || null);
  const fallbackArtist =
    (resolved.artist ?? '').trim() ||
    joinMyListArtistsForStorage(suggested.artists) ||
    artistHint ||
    '';
  const fallbackTitle = (resolved.song ?? '').trim() || (suggested.title || rawTitle).trim();

  const domestic = await resolveDomesticSongMetadataForRegistration({
    rawTitle,
    channelTitle,
    channelAuthor: authorName ?? artistHint ?? null,
    resolvedArtist: fallbackArtist,
    resolvedSong: fallbackTitle,
    preferJapaneseScriptDisplay: true,
  });

  const artist = domestic?.mainArtist || fallbackArtist;
  const title = domestic?.songTitle || fallbackTitle;
  const displayTitle = domestic?.displayTitle || (artist && title ? `${artist} - ${title}` : title);

  const gateInput = buildSongDbRegistrationInput({
    videoId: row.videoId,
    rawTitle,
    channelTitle,
    channelId: snippet?.channelId ?? null,
    categoryId: snippet?.categoryId ?? null,
    description: snippet?.description ?? null,
    mainArtist: artist,
    songTitle: title,
    hasMusic8Match: false,
    isJapaneseDomestic: true,
    channelAuthorName: authorName,
    viewCount: snippet?.viewCount ?? null,
  });
  const gate = shouldPersistVideoToSongDatabase(gateInput);

  const working: SeedItemWorking = {
    videoId: row.videoId,
    artist,
    title,
    originalReleaseDate: domestic?.originalReleaseDate ?? null,
    include: gate.persist,
    note: null,
    rawTitle,
    channelTitle,
    channelId: snippet?.channelId ?? null,
    displayTitle,
    genres: domestic?.genres ?? [],
    youtubePublishedAt: snippet?.publishedAt ?? null,
    applyStatus: null,
    applyError: null,
    songId: null,
  };
  working.note = reviewHintForItem({
    channelTitle,
    artist,
    rawTitle,
    gatePersist: gate.persist,
  });
  return working;
}

async function cmdFetch(argv: string[]): Promise<void> {
  // 邦楽 seed では検証用 oEmbed モードを無効化（表記解決精度のため）
  delete process.env.YT_ARTIST_TITLE_MODE;

  const args = parseArgs(argv);
  const playlistId = parsePlaylistId(args.get('playlist-url') ?? '', args.get('playlist-id') ?? '');
  const outPath = args.get('out')?.trim();
  const maxItems = parsePositiveIntOrNull(args.get('max-items'));

  if (!playlistId) {
    console.error('--playlist-url または --playlist-id が必要です。');
    process.exit(1);
  }
  if (!outPath) {
    console.error('--out=path.json が必要です。');
    process.exit(1);
  }

  console.error(`[fetch] playlist ${playlistId}`);
  const rows = await fetchPlaylistRows(playlistId, maxItems);
  console.error(`[fetch] ${rows.length} videos — resolving metadata (MB 1req/s のため数分かかります)`);

  const items: SeedItemWorking[] = [];
  for (let i = 0; i < rows.length; i += 1) {
    const item = await resolveItemMetadata(rows[i]!);
    items.push(item);
    if ((i + 1) % 5 === 0 || i + 1 === rows.length) {
      console.error(`[fetch] ${i + 1}/${rows.length}`);
    }
  }

  const doc: ParsedSeedDoc = {
    schemaVersion: 2,
    playlistUrl: buildPlaylistUrl(playlistId),
    playlistId,
    items,
  };

  const absOut = path.resolve(process.cwd(), outPath);
  fs.mkdirSync(path.dirname(absOut), { recursive: true });
  writeSeedDocV2(absOut, doc);

  console.error(`[fetch] 保存: ${absOut}`);
  printSeedSummary(items);
  console.error('[fetch] JSON を確認し、必要なら artist/title/日付/include を編集してから apply を実行してください。');
}

async function loadExistingVideoIds(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  videoIds: string[],
): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  const uniq = [...new Set(videoIds)];
  const chunkSize = 150;
  for (let i = 0; i < uniq.length; i += chunkSize) {
    const chunk = uniq.slice(i, i + chunkSize);
    const { data, error } = await admin.from('song_videos').select('video_id, song_id').in('video_id', chunk);
    if (error) {
      if (error.code === '42P01') return out;
      throw new Error(`song_videos 照会失敗: ${error.message}`);
    }
    for (const row of data ?? []) {
      const cast = row as { video_id?: unknown; song_id?: unknown };
      const vid = typeof cast.video_id === 'string' ? cast.video_id.trim() : '';
      if (!vid) continue;
      const sid = typeof cast.song_id === 'string' ? cast.song_id.trim() : null;
      out.set(vid, sid || null);
    }
  }
  return out;
}

function readSeedDoc(inPath: string): ParsedSeedDoc {
  const abs = path.resolve(process.cwd(), inPath);
  if (!fs.existsSync(abs)) throw new Error(`入力ファイルがありません: ${abs}`);
  const raw = JSON.parse(fs.readFileSync(abs, 'utf8')) as DomesticSeedDocV1 | DomesticSeedDocV2;
  if (!raw || !Array.isArray(raw.items)) {
    throw new Error('JSON 形式が不正です（items 配列が必要）');
  }

  if (raw.schemaVersion === 2) {
    const v2 = raw as DomesticSeedDocV2;
    return {
      schemaVersion: 2,
      playlistId: v2.playlistId,
      playlistUrl: v2.playlistUrl,
      items: v2.items.map(v2ItemToWorking),
    };
  }

  const v1 = raw as DomesticSeedDocV1;
  return {
    schemaVersion: 1,
    playlistId: v1.playlistId ?? '',
    playlistUrl: v1.playlistUrl ?? '',
    items: v1.items.map(v1ItemToWorking),
  };
}

function cmdCompact(argv: string[]): void {
  const args = parseArgs(argv);
  const inPath = args.get('in')?.trim();
  const inPlace = hasFlag(argv, 'in-place');
  let outPath = args.get('out')?.trim();

  if (!inPath) {
    console.error('--in=path.json が必要です。');
    process.exit(1);
  }

  const absIn = path.resolve(process.cwd(), inPath);
  const doc = readSeedDoc(absIn);
  if (inPlace) outPath = absIn;
  if (!outPath) {
    const ext = path.extname(absIn);
    const base = absIn.slice(0, -ext.length);
    outPath = `${base}-compact${ext}`;
  } else if (!path.isAbsolute(outPath)) {
    outPath = path.resolve(process.cwd(), outPath);
  }

  writeSeedDocV2(outPath, doc);
  const summary = buildSummary(doc.items);
  console.error(`[compact] ${absIn} -> ${outPath}`);
  console.error(`  ${summary.total} 件 / include ${summary.included} / 原盤日 ${summary.withReleaseDate} / YouTube日 ${summary.withYoutubeDate}`);
}

async function cmdEnrich(argv: string[]): Promise<void> {
  const args = parseArgs(argv);
  const inPath = args.get('in')?.trim();
  const inPlace = hasFlag(argv, 'in-place');
  const fillMb = hasFlag(argv, 'mb');
  let outPath = args.get('out')?.trim();

  if (!inPath) {
    console.error('--in=path.json が必要です。');
    process.exit(1);
  }

  const absIn = path.resolve(process.cwd(), inPath);
  const doc = readSeedDoc(absIn);
  if (inPlace) outPath = absIn;
  if (!outPath) {
    const ext = path.extname(absIn);
    const base = absIn.slice(0, -ext.length);
    outPath = `${base}-enriched${ext}`;
  } else if (!path.isAbsolute(outPath)) {
    outPath = path.resolve(process.cwd(), outPath);
  }

  let youtubeFilled = 0;
  let releaseFilled = 0;

  for (const item of doc.items) {
    if (!isoToDateOnly(item.youtubePublishedAt)) {
      const snippet = await getVideoSnippet(item.videoId, { source: 'domestic-playlist-seed-enrich' });
      if (snippet?.publishedAt) {
        item.youtubePublishedAt = snippet.publishedAt;
        youtubeFilled += 1;
      }
    }

    if (fillMb && !item.originalReleaseDate && item.artist && item.title) {
      const { fetchMusicBrainzRecordingMetadata } = await import('@/lib/musicbrainz-recording-metadata');
      const mb = await fetchMusicBrainzRecordingMetadata(item.artist, item.title);
      if (mb?.originalReleaseDate) {
        item.originalReleaseDate = mb.originalReleaseDate;
        releaseFilled += 1;
      }
    }
  }

  writeSeedDocV2(outPath, doc);
  console.error(`[enrich] ${absIn} -> ${outPath}`);
  console.error(`  YouTube日 補完: ${youtubeFilled} / 原盤日(MB) 補完: ${releaseFilled}`);
  printSeedSummary(doc.items);
}

async function cmdApply(argv: string[]): Promise<void> {
  const args = parseArgs(argv);
  const inPath = args.get('in')?.trim();
  const dryRun = hasFlag(argv, 'dry-run');
  const forceAllow = hasFlag(argv, 'force-allow');
  const skipExisting = !hasFlag(argv, 'no-skip-existing');

  if (!inPath) {
    console.error('--in=path.json が必要です。');
    process.exit(1);
  }

  const admin = createAdminClient();
  if (!admin) {
    console.error('SUPABASE_SERVICE_ROLE_KEY 等が未設定です。');
    process.exit(1);
  }

  const absIn = path.resolve(process.cwd(), inPath);
  const doc = readSeedDoc(absIn);
  const existing = await loadExistingVideoIds(
    admin,
    doc.items.map((i) => i.videoId),
  );

  let imported = 0;
  let skippedExisting = 0;
  let skippedExcluded = 0;
  let skippedGate = 0;
  let failed = 0;

  for (const item of doc.items) {
    item.applyError = null;

    if (item.include === false) {
      item.applyStatus = 'skipped_excluded';
      skippedExcluded += 1;
      continue;
    }

    if (!item.artist?.trim() || !item.title?.trim()) {
      item.applyStatus = 'failed';
      item.applyError = 'artist / title が空です';
      failed += 1;
      continue;
    }

    if (skipExisting && existing.has(item.videoId)) {
      item.applyStatus = 'skipped_existing';
      item.songId = existing.get(item.videoId) ?? null;
      skippedExisting += 1;
      continue;
    }

    const snippet = await getVideoSnippet(item.videoId, { source: 'domestic-playlist-seed-apply' });
    if (snippet?.publishedAt && !item.youtubePublishedAt) {
      item.youtubePublishedAt = snippet.publishedAt;
    }
    const gateInput = buildSongDbRegistrationInput({
      videoId: item.videoId,
      rawTitle: snippet?.title ?? item.rawTitle ?? item.title,
      channelTitle: snippet?.channelTitle ?? item.channelTitle,
      channelId: snippet?.channelId ?? item.channelId,
      categoryId: snippet?.categoryId ?? null,
      description: snippet?.description ?? null,
      mainArtist: item.artist,
      songTitle: item.title,
      hasMusic8Match: false,
      isJapaneseDomestic: true,
      viewCount: snippet?.viewCount ?? null,
      forceAllow,
    });
    const gate = shouldPersistVideoToSongDatabase(gateInput);
    if (!gate.persist) {
      item.applyStatus = 'skipped_gate';
      item.applyError = gate.reason;
      skippedGate += 1;
      continue;
    }

    if (dryRun) {
      item.applyStatus = 'dry_run';
      imported += 1;
      continue;
    }

    try {
      const artistSlugHint = latinArtistSlugHintFromChannel(item.channelTitle);
      const songId = await upsertSongAndVideo({
        supabase: admin,
        videoId: item.videoId,
        mainArtist: item.artist,
        songTitle: item.title,
        variant: 'official',
        youtubePublishedAtIso: snippet?.publishedAt ?? item.youtubePublishedAt ?? null,
        originalReleaseDateIso: item.originalReleaseDate ?? undefined,
        genres: item.genres.length > 0 ? item.genres : undefined,
        domesticLightDb: true,
        artistSlugHint,
        catalogScope: resolveSongCatalogScope({
          mainArtist: item.artist,
          songTitle: item.title,
          displayTitle: item.displayTitle,
          isJapaneseEconomy: true,
        }),
        registrationCheck: gateInput,
      });
      if (!songId) {
        item.applyStatus = 'failed';
        item.applyError = 'upsertSongAndVideo が null を返しました';
        failed += 1;
        continue;
      }
      item.applyStatus = 'imported';
      item.songId = songId;
      existing.set(item.videoId, songId);
      imported += 1;
    } catch (e) {
      item.applyStatus = 'failed';
      item.applyError = e instanceof Error ? e.message : String(e);
      failed += 1;
    }
  }

  writeSeedDocV2(absIn, doc);

  const summary = buildSummary(doc.items);
  console.error(
    `[apply] ${dryRun ? 'dry-run' : 'done'} — imported ${imported}, existing ${skippedExisting}, excluded ${skippedExcluded}, gate ${skippedGate}, failed ${failed}`,
  );
  console.error(`[apply] JSON 更新: ${absIn} (schema v2, ${summary.included} include)`);
}

function printHelp(): void {
  console.log(`domestic-playlist-seed — YouTube プレイリスト → 邦楽 DB シード

Commands:
  fetch    プレイリストから確認用 JSON（schema v2・最小項目）を生成
  compact  旧 JSON (v1) を v2 最小形式に変換
  enrich   v2 JSON に youtubeDate（--mb で releaseDate も）を API 補完
  apply    JSON を読み込み MC 邦楽 DB へ投入

JSON v2 item（1曲あたり）:
  videoId, artist, title, releaseDate?, youtubeDate?, include, note?
  releaseDate = 原盤公開日（MusicBrainz） / youtubeDate = YouTube 動画公開日
  apply 後: status, songId

Examples:
  npx tsx scripts/domestic-playlist-seed.ts fetch --playlist-url="..." --out=tmp/seed.json
  npx tsx scripts/domestic-playlist-seed.ts compact --in=tmp/seed-old.json --in-place
  npx tsx scripts/domestic-playlist-seed.ts enrich --in=tmp/seed.json --in-place
  npx tsx scripts/domestic-playlist-seed.ts apply --in=tmp/seed.json --dry-run --force-allow
`);
}

async function main(): Promise<void> {
  loadDotEnvLocal();
  const [cmd, ...rest] = process.argv.slice(2);
  if (!cmd || cmd === '--help' || cmd === '-h') {
    printHelp();
    return;
  }
  if (cmd === 'fetch') {
    await cmdFetch(rest);
    return;
  }
  if (cmd === 'compact') {
    cmdCompact(rest);
    return;
  }
  if (cmd === 'enrich') {
    await cmdEnrich(rest);
    return;
  }
  if (cmd === 'apply') {
    await cmdApply(rest);
    return;
  }
  console.error(`不明なコマンド: ${cmd}`);
  printHelp();
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
