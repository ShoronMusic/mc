/**
 * 邦楽アーティスト編集 — YouTube プレイリストから曲メタを取得・DB 投入。
 * CLI `scripts/domestic-playlist-seed.ts` と管理 API で共用。
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveDomesticSongMetadataForRegistration } from '@/lib/domestic-song-registration';
import { latinArtistSlugHintFromChannel } from '@/lib/jp-domestic-youtube-title';
import {
  joinMyListArtistsForStorage,
  suggestMyListArtistTitleFromYoutubeStyle,
} from '@/lib/my-list-youtube-title-suggest';
import {
  buildSongDbRegistrationInput,
  shouldPersistVideoToSongDatabase,
} from '@/lib/song-db-registration-gate';
import { resolveSongCatalogScope } from '@/lib/song-catalog-scope';
import { upsertSongAndVideo } from '@/lib/song-entities';
import {
  ensureArtistForSongRegistration,
  ensureDomesticArtistForSongRegistration,
} from '@/lib/artist-selection-register';
import {
  clearArtistLookupIndexCache,
  loadArtistLookupIndex,
  syncSongCreditsForSong,
} from '@/lib/song-credits-sync';
import { resolveArtistSongForPackAsync } from '@/lib/youtube-artist-song-for-pack';
import { fetchOEmbed } from '@/lib/youtube-oembed';
import { getVideoSnippet } from '@/lib/youtube-search';
import { buildExplicitCreditArtists } from '@/lib/admin-domestic-playlist-artists-field';
import {
  fetchMusicBrainzRecordingMetadata,
} from '@/lib/musicbrainz-recording-metadata';

export {
  buildExplicitCreditArtists,
  formatPlaylistArtistsField,
  parseCreditArtistsInput,
  parsePlaylistArtistsField,
} from '@/lib/admin-domestic-playlist-artists-field';

/** 邦楽ライト DB / 洋楽通常登録 */
export type ArtistPlaylistCatalogMode = 'domestic' | 'western';

export type DomesticPlaylistRow = {
  videoId: string;
  rawTitle: string;
  channelTitle: string;
  ownerChannel: string;
};

export type DomesticArtistPlaylistHints = {
  name: string;
  nameEn?: string | null;
  nameJa?: string | null;
  youtubeChannelId?: string | null;
};

export type DomesticArtistPlaylistItem = {
  index: number;
  videoId: string;
  url: string;
  artist: string;
  title: string;
  displayTitle: string;
  rawTitle: string;
  channelTitle: string | null;
  channelId: string | null;
  releaseDate: string | null;
  /** 曲名の日本語読み（カタカナ等） */
  songTitleJa: string | null;
  youtubeDate: string | null;
  genres: string[];
  metadataSource: string | null;
  officialGate: { persist: boolean; reason: string };
  include: boolean;
  note: string | null;
  artistMatch: 'channel' | 'name' | 'mismatch' | 'unknown';
  existingSongId: string | null;
};

export type FetchDomesticArtistPlaylistResult = {
  playlistId: string;
  playlistUrl: string;
  items: DomesticArtistPlaylistItem[];
  summary: {
    /** 表に出した件数（DB未登録のみ） */
    total: number;
    /** プレイリストから読んだ件数（既存含む） */
    playlistFetched: number;
    included: number;
    gateOk: number;
    artistMatched: number;
    withReleaseDate: number;
    /** DB に既にある video_id で弾いた件数 */
    existingVideos: number;
    skippedExisting: number;
  };
};

function normalizeArtistKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, '');
}

export function parseYoutubePlaylistId(playlistUrl: string, playlistIdRaw = ''): string | null {
  const id = playlistIdRaw.trim();
  if (id) return id;
  const url = playlistUrl.trim();
  if (!url) return null;
  try {
    return new URL(url).searchParams.get('list')?.trim() ?? null;
  } catch {
    return null;
  }
}

export function buildYoutubePlaylistUrl(playlistId: string): string {
  return `https://www.youtube.com/playlist?list=${encodeURIComponent(playlistId)}`;
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

export function youtubeChannelIdsLooselyMatch(a: string | null, b: string | null): boolean {
  const x = (a ?? '').trim();
  const y = (b ?? '').trim();
  if (!x || !y) return false;
  if (x === y || x.toLowerCase() === y.toLowerCase()) return true;
  if (x.length !== y.length) return false;
  let diffs = 0;
  for (let i = 0; i < x.length; i += 1) {
    if (x[i] !== y[i]) diffs += 1;
    if (diffs > 1) return false;
  }
  return diffs === 1;
}

export function artistNameMatchesRegisteredArtist(
  resolvedArtist: string,
  hints: DomesticArtistPlaylistHints,
): boolean {
  const key = normalizeArtistKey(resolvedArtist);
  if (!key) return false;
  const candidates = [hints.name, hints.nameEn, hints.nameJa]
    .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
    .map(normalizeArtistKey);
  return candidates.some((c) => key === c || key.includes(c) || c.includes(key));
}

function reviewHintForItem(item: {
  channelTitle: string | null;
  artist: string;
  rawTitle: string;
  gatePersist: boolean;
  artistMatch: DomesticArtistPlaylistItem['artistMatch'];
}): string | null {
  if (item.artistMatch === 'mismatch') {
    return '登録アーティストと一致しません。内容確認後 include を検討';
  }
  if (item.gatePersist) return null;
  const ch = (item.channelTitle ?? '').trim().toLowerCase();
  const ar = item.artist.trim().toLowerCase();
  if (ch && ar && (ch === ar || ch.startsWith(ar) || ar.startsWith(ch))) {
    return 'チャンネル名とアーティスト一致。公式チャンネルMVの可能性が高い → 確認後 include:true、apply は forceAllow';
  }
  if (/\bMV\b/u.test(item.rawTitle) || /」\s*MV/u.test(item.rawTitle)) {
    return 'MV表記あり。内容確認後 include を検討';
  }
  return null;
}

export async function fetchYoutubePlaylistRows(
  playlistId: string,
  maxItems: number | null,
): Promise<DomesticPlaylistRow[]> {
  const apiKey = process.env.YOUTUBE_API_KEY?.trim();
  if (!apiKey) throw new Error('YOUTUBE_API_KEY が未設定です。');

  const rows: DomesticPlaylistRow[] = [];
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

/**
 * プレイリストを先頭から走査し、DB 未登録の video を最大 targetNewCount 件集める。
 * 既存 ID は飛ばすので「前回10件投入済み → 今回また10件」で続きが取れる。
 */
export async function fetchYoutubePlaylistNewRows(input: {
  playlistId: string;
  /** 表に出したい未登録件数。null なら走査範囲内の未登録を全件 */
  targetNewCount: number | null;
  /** 走査上限（既定 200） */
  maxScan?: number;
  existingVideoMap?: Map<string, string | null>;
  admin?: SupabaseClient | null;
}): Promise<{
  scanned: DomesticPlaylistRow[];
  newRows: DomesticPlaylistRow[];
  skippedExisting: number;
}> {
  const apiKey = process.env.YOUTUBE_API_KEY?.trim();
  if (!apiKey) throw new Error('YOUTUBE_API_KEY が未設定です。');

  const targetNew = input.targetNewCount;
  const maxScan = Math.max(1, Math.min(input.maxScan ?? 200, 500));
  /** video_id が song_videos に存在する＝既存（スキップ） */
  const existingIds = new Set<string>();
  if (input.existingVideoMap) {
    for (const vid of input.existingVideoMap.keys()) {
      if (vid) existingIds.add(vid);
    }
  }

  const scanned: DomesticPlaylistRow[] = [];
  const newRows: DomesticPlaylistRow[] = [];
  let skippedExisting = 0;
  let nextPageToken: string | null = null;

  while (scanned.length < maxScan) {
    if (targetNew != null && newRows.length >= targetNew) break;

    const params = new URLSearchParams({
      part: 'snippet,contentDetails',
      playlistId: input.playlistId,
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

    const pageRows: DomesticPlaylistRow[] = [];
    for (const item of data.items ?? []) {
      const videoId = item.contentDetails?.videoId?.trim();
      if (!videoId) continue;
      pageRows.push({
        videoId,
        rawTitle: item.snippet?.title?.trim() ?? '',
        channelTitle: item.snippet?.channelTitle?.trim() ?? '',
        ownerChannel: item.snippet?.videoOwnerChannelTitle?.trim() ?? '',
      });
      if (scanned.length + pageRows.length >= maxScan) break;
    }

    if (input.admin && pageRows.length > 0) {
      const unknown = pageRows.map((r) => r.videoId).filter((id) => !existingIds.has(id));
      if (unknown.length > 0) {
        const found = await loadExistingSongIdsByVideoIds(input.admin, unknown);
        for (const vid of found.keys()) {
          if (vid) existingIds.add(vid);
        }
      }
    }

    for (const row of pageRows) {
      scanned.push(row);
      if (existingIds.has(row.videoId)) {
        skippedExisting += 1;
        continue;
      }
      newRows.push(row);
      if (targetNew != null && newRows.length >= targetNew) break;
    }

    nextPageToken = data.nextPageToken?.trim() || null;
    if (!nextPageToken) break;
  }

  return {
    scanned,
    newRows: targetNew != null ? newRows.slice(0, targetNew) : newRows,
    skippedExisting,
  };
}

async function resolvePlaylistItemMetadata(
  row: DomesticPlaylistRow,
  hints?: DomesticArtistPlaylistHints | null,
  mode: ArtistPlaylistCatalogMode = 'domestic',
): Promise<Omit<DomesticArtistPlaylistItem, 'index' | 'url' | 'existingSongId'>> {
  const isDomestic = mode === 'domestic';
  const artistHint = row.ownerChannel || row.channelTitle;
  const oembed = await fetchOEmbed(row.videoId).catch(() => null);
  const snippet = await getVideoSnippet(row.videoId, {
    source: isDomestic ? 'admin-domestic-artist-playlist' : 'admin-western-artist-playlist',
  });
  const rawTitle = snippet?.title?.trim() || row.rawTitle || row.videoId;
  const channelTitle = snippet?.channelTitle?.trim() || row.channelTitle || null;
  const channelId = snippet?.channelId ?? null;
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

  let artist = fallbackArtist;
  let title = fallbackTitle;
  let displayTitle = artist && title ? `${artist} - ${title}` : title;
  let releaseDate: string | null = null;
  let songTitleJa: string | null = null;
  let genres: string[] = [];
  let metadataSource: string | null = null;

  if (isDomestic) {
    const domestic = await resolveDomesticSongMetadataForRegistration({
      rawTitle,
      channelTitle,
      channelAuthor: authorName ?? artistHint ?? null,
      resolvedArtist: fallbackArtist,
      resolvedSong: fallbackTitle,
      preferJapaneseScriptDisplay: true,
    });
    if (domestic) {
      artist = domestic.mainArtist || artist;
      title = domestic.songTitle || title;
      displayTitle = domestic.displayTitle || displayTitle;
      releaseDate = domestic.originalReleaseDate;
      songTitleJa = domestic.songTitleJa;
      genres = domestic.genres ?? [];
      metadataSource = domestic.source;
    }
  } else {
    // 洋楽: MusicBrainz で原盤日・表記を補完（失敗時は YouTube 解決のまま）
    try {
      const mb = await fetchMusicBrainzRecordingMetadata(fallbackArtist, fallbackTitle);
      if (mb) {
        artist = mb.mainArtist || artist;
        title = mb.songTitle || title;
        displayTitle = mb.displayTitle || displayTitle;
        releaseDate = mb.originalReleaseDate;
        genres = mb.genres ?? [];
        metadataSource = 'musicbrainz';
      }
    } catch {
      /* ignore */
    }
  }

  let artistMatch: DomesticArtistPlaylistItem['artistMatch'] = 'unknown';

  if (hints?.name?.trim()) {
    const channelIdHint = hints.youtubeChannelId?.trim() || null;
    if (channelIdHint && channelId && youtubeChannelIdsLooselyMatch(channelIdHint, channelId)) {
      artistMatch = 'channel';
      artist = hints.name.trim();
      displayTitle = `${artist} - ${title}`;
    } else if (artistNameMatchesRegisteredArtist(artist, hints)) {
      artistMatch = 'name';
      artist = hints.name.trim();
      displayTitle = `${artist} - ${title}`;
    } else {
      artistMatch = 'mismatch';
    }
  }

  const gateInput = buildSongDbRegistrationInput({
    videoId: row.videoId,
    rawTitle,
    channelTitle,
    channelId,
    categoryId: snippet?.categoryId ?? null,
    description: snippet?.description ?? null,
    mainArtist: artist,
    songTitle: title,
    hasMusic8Match: false,
    isJapaneseDomestic: isDomestic,
    channelAuthorName: authorName,
    viewCount: snippet?.viewCount ?? null,
  });
  const gate = shouldPersistVideoToSongDatabase(gateInput);

  let include = gate.persist;
  if (artistMatch === 'mismatch') include = false;

  const note = reviewHintForItem({
    channelTitle,
    artist,
    rawTitle,
    gatePersist: gate.persist,
    artistMatch,
  });

  return {
    videoId: row.videoId,
    artist,
    title,
    displayTitle,
    rawTitle,
    channelTitle,
    channelId,
    releaseDate,
    songTitleJa,
    youtubeDate: isoToDateOnly(snippet?.publishedAt),
    genres,
    metadataSource,
    officialGate: { persist: gate.persist, reason: gate.reason },
    include,
    note,
    artistMatch,
  };
}

export async function loadExistingSongIdsByVideoIds(
  admin: SupabaseClient,
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

export async function fetchDomesticArtistPlaylist(input: {
  playlistUrl?: string;
  playlistId?: string;
  maxItems?: number | null;
  artistHints?: DomesticArtistPlaylistHints | null;
  existingVideoMap?: Map<string, string | null>;
  admin?: SupabaseClient | null;
  /** 既定 domestic。洋楽アーティストページから呼ぶときは western */
  catalogMode?: ArtistPlaylistCatalogMode;
}): Promise<FetchDomesticArtistPlaylistResult> {
  const playlistId = parseYoutubePlaylistId(input.playlistUrl ?? '', input.playlistId ?? '');
  if (!playlistId) throw new Error('playlistUrl または playlistId が必要です。');
  const catalogMode = input.catalogMode === 'western' ? 'western' : 'domestic';

  // maxItems = 未登録を何件まで表に出すか（既存は飛ばして続きから埋める）
  const collected = await fetchYoutubePlaylistNewRows({
    playlistId,
    targetNewCount: input.maxItems ?? null,
    existingVideoMap: input.existingVideoMap,
    admin: input.admin ?? null,
  });

  const items: DomesticArtistPlaylistItem[] = [];
  for (let i = 0; i < collected.newRows.length; i += 1) {
    const meta = await resolvePlaylistItemMetadata(
      collected.newRows[i]!,
      input.artistHints ?? null,
      catalogMode,
    );
    items.push({
      index: i + 1,
      url: `https://www.youtube.com/watch?v=${meta.videoId}`,
      existingSongId: null,
      ...meta,
    });
  }

  return {
    playlistId,
    playlistUrl: buildYoutubePlaylistUrl(playlistId),
    items,
    summary: {
      total: items.length,
      playlistFetched: collected.scanned.length,
      included: items.filter((i) => i.include).length,
      gateOk: items.filter((i) => i.officialGate.persist).length,
      artistMatched: items.filter((i) => i.artistMatch === 'channel' || i.artistMatch === 'name')
        .length,
      withReleaseDate: items.filter((i) => i.releaseDate).length,
      existingVideos: collected.skippedExisting,
      skippedExisting: collected.skippedExisting,
    },
  };
}

/** 洋楽アーティストページ用エイリアス */
export async function fetchWesternArtistPlaylist(
  input: Omit<Parameters<typeof fetchDomesticArtistPlaylist>[0], 'catalogMode'>,
): Promise<FetchDomesticArtistPlaylistResult> {
  return fetchDomesticArtistPlaylist({ ...input, catalogMode: 'western' });
}

export type ApplyDomesticArtistPlaylistItemInput = {
  videoId: string;
  artist: string;
  title: string;
  displayTitle?: string;
  releaseDate?: string | null;
  songTitleJa?: string | null;
  youtubeDate?: string | null;
  genres?: string[];
  include?: boolean;
  rawTitle?: string | null;
  channelTitle?: string | null;
  channelId?: string | null;
  /** 共演アーティスト（main 以外。`song_credits` 用） */
  creditArtists?: string[];
};

export type ApplyDomesticArtistPlaylistItemResult = {
  videoId: string;
  status: 'imported' | 'dry_run' | 'skipped_excluded' | 'skipped_existing' | 'skipped_gate' | 'failed';
  songId: string | null;
  error: string | null;
  creditCount?: number;
  creditUnresolved?: string[];
};

export async function applyDomesticArtistPlaylistItems(
  admin: SupabaseClient,
  items: ApplyDomesticArtistPlaylistItemInput[],
  options: {
    dryRun?: boolean;
    forceAllow?: boolean;
    skipExisting?: boolean;
    registrationArtistName?: string | null;
    catalogMode?: ArtistPlaylistCatalogMode;
  } = {},
): Promise<ApplyDomesticArtistPlaylistItemResult[]> {
  const dryRun = options.dryRun === true;
  const forceAllow = options.forceAllow === true;
  const skipExisting = options.skipExisting !== false;
  const registrationArtist = options.registrationArtistName?.trim() || null;
  const catalogMode = options.catalogMode === 'western' ? 'western' : 'domestic';
  const isDomestic = catalogMode === 'domestic';

  const existing = await loadExistingSongIdsByVideoIds(
    admin,
    items.map((i) => i.videoId),
  );

  const results: ApplyDomesticArtistPlaylistItemResult[] = [];

  for (const item of items) {
    const base: ApplyDomesticArtistPlaylistItemResult = {
      videoId: item.videoId,
      status: 'failed',
      songId: null,
      error: null,
    };

    if (item.include === false) {
      results.push({ ...base, status: 'skipped_excluded' });
      continue;
    }

    const artist = (registrationArtist || item.artist || '').trim();
    const title = (item.title || '').trim();
    if (!artist || !title) {
      results.push({ ...base, error: 'artist / title が空です' });
      continue;
    }

    if (skipExisting && existing.has(item.videoId)) {
      results.push({
        ...base,
        status: 'skipped_existing',
        songId: existing.get(item.videoId) ?? null,
      });
      continue;
    }

    const snippet = await getVideoSnippet(item.videoId, {
      source: isDomestic
        ? 'admin-domestic-artist-playlist-apply'
        : 'admin-western-artist-playlist-apply',
    });
    const youtubePublishedAt =
      snippet?.publishedAt ?? dateOnlyToIso(item.youtubeDate) ?? null;
    const displayTitle = item.displayTitle?.trim() || `${artist} - ${title}`;

    const gateInput = buildSongDbRegistrationInput({
      videoId: item.videoId,
      rawTitle: snippet?.title ?? item.rawTitle ?? title,
      channelTitle: snippet?.channelTitle ?? item.channelTitle,
      channelId: snippet?.channelId ?? item.channelId,
      categoryId: snippet?.categoryId ?? null,
      description: snippet?.description ?? null,
      mainArtist: artist,
      songTitle: title,
      hasMusic8Match: false,
      isJapaneseDomestic: isDomestic,
      viewCount: snippet?.viewCount ?? null,
      forceAllow,
    });
    const gate = shouldPersistVideoToSongDatabase(gateInput);
    if (!gate.persist) {
      results.push({ ...base, status: 'skipped_gate', error: gate.reason });
      continue;
    }

    if (dryRun) {
      if (item.creditArtists && item.creditArtists.length > 0) {
        const creditPreview = buildExplicitCreditArtists(artist, item.creditArtists);
        results.push({
          ...base,
          status: 'dry_run',
          creditCount: creditPreview.length,
        });
      } else {
        results.push({ ...base, status: 'dry_run' });
      }
      continue;
    }

    try {
      const artistSlugHint = isDomestic
        ? latinArtistSlugHintFromChannel(item.channelTitle)
        : null;
      const songId = await upsertSongAndVideo({
        supabase: admin,
        videoId: item.videoId,
        mainArtist: artist,
        songTitle: title,
        variant: 'official',
        youtubePublishedAtIso: youtubePublishedAt,
        originalReleaseDateIso: item.releaseDate ?? undefined,
        songTitleJa: isDomestic ? item.songTitleJa ?? undefined : undefined,
        genres: item.genres && item.genres.length > 0 ? item.genres : undefined,
        domesticLightDb: isDomestic,
        artistSlugHint,
        catalogScope: resolveSongCatalogScope({
          mainArtist: artist,
          songTitle: title,
          displayTitle,
          isJapaneseEconomy: isDomestic,
        }),
        registrationCheck: gateInput,
      });
      if (!songId) {
        results.push({ ...base, error: 'upsertSongAndVideo が null を返しました' });
        continue;
      }
      existing.set(item.videoId, songId);

      let creditCount: number | undefined;
      let creditUnresolved: string[] | undefined;
      const extraCredits = item.creditArtists ?? [];
      if (extraCredits.length > 0) {
        try {
          const index = await loadArtistLookupIndex(admin);
          for (const name of extraCredits) {
            if (isDomestic) {
              await ensureDomesticArtistForSongRegistration(admin, name, { index });
            } else {
              await ensureArtistForSongRegistration(admin, name, index);
            }
          }
          clearArtistLookupIndexCache();
          const freshIndex = await loadArtistLookupIndex(admin);
          const creditSync = await syncSongCreditsForSong(
            admin,
            songId,
            {
              main_artist: artist,
              display_title: displayTitle,
              spotify_artists: null,
              music8_song_data: null,
              explicitCreditArtists: buildExplicitCreditArtists(artist, extraCredits),
            },
            freshIndex,
            true,
          );
          creditCount = creditSync.creditCount;
          creditUnresolved = creditSync.unresolved;
        } catch (e) {
          console.warn('[admin-artist-playlist] song_credits sync', e);
          creditUnresolved = extraCredits;
        }
      }

      results.push({
        ...base,
        status: 'imported',
        songId,
        creditCount,
        creditUnresolved,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      results.push({ ...base, error: msg });
    }
  }

  return results;
}

export async function applyWesternArtistPlaylistItems(
  admin: SupabaseClient,
  items: ApplyDomesticArtistPlaylistItemInput[],
  options: Omit<
    Parameters<typeof applyDomesticArtistPlaylistItems>[2],
    'catalogMode'
  > = {},
): Promise<ApplyDomesticArtistPlaylistItemResult[]> {
  return applyDomesticArtistPlaylistItems(admin, items, {
    ...options,
    catalogMode: 'western',
  });
}
