import type { SupabaseClient } from '@supabase/supabase-js';
import { lookupMusicBrainzReleaseDate } from '@/lib/admin-songs-batch-musicbrainz-dates';
import { getSongEra } from '@/lib/gemini';
import { SONG_ERA_OPTIONS, type SongEraOption } from '@/lib/song-era-options';

export interface SongEraResolveInput {
  songTitle: string;
  artistName?: string | null;
  oembedTitle?: string | null;
  description?: string | null;
  /** YouTube Data API の `publishedAt`（MV 公開年。原盤日が無いときのフォールバック） */
  publishedAtIso?: string | null;
  /** `songs.original_release_date` または同等の原盤日（YYYY-MM-DD / YYYY.MM 等） */
  originalReleaseDate?: string | null;
  songId?: string | null;
}

function normalizeEra(era: string | null | undefined): SongEraOption | null {
  if (typeof era !== 'string') return null;
  const trimmed = era.trim();
  return SONG_ERA_OPTIONS.includes(trimmed as SongEraOption) ? (trimmed as SongEraOption) : null;
}

/** 西暦から十年ラベル */
export function songEraFromCalendarYear(year: number): SongEraOption | null {
  if (!Number.isFinite(year) || year < 1900 || year > 2100) return null;
  const y = Math.floor(year);
  if (y < 1950) return 'Pre-50s';
  if (y < 1960) return '50s';
  if (y < 1970) return '60s';
  if (y < 1980) return '70s';
  if (y < 1990) return '80s';
  if (y < 2000) return '90s';
  if (y < 2010) return '00s';
  if (y < 2020) return '10s';
  return '20s';
}

/** 曲マスタの公開年（原盤）から十年ラベル */
export function songEraFromOriginalReleaseDate(raw: string | null | undefined): SongEraOption | null {
  const s = (raw ?? '').trim();
  if (!s) return null;
  const m = s.match(/^(\d{4})/);
  if (!m) return null;
  return songEraFromCalendarYear(Number(m[1]));
}

/** YouTube 動画の公開年から十年ラベル（録音年ではなく MV/公式動画の公開に基づく目安） */
export function songEraFromYoutubePublishedAt(iso: string | null | undefined): SongEraOption | null {
  if (!iso || typeof iso !== 'string') return null;
  const d = new Date(iso.trim());
  if (Number.isNaN(d.getTime())) return null;
  return songEraFromCalendarYear(d.getUTCFullYear());
}

/**
 * 公開年（原盤）があればそれを最優先。無ければキャッシュ → AI → YouTube 公開年（最終手段）。
 * ※ YouTube PV のアップロード年は原盤年代とズレやすいので AI より後。
 */
export function resolveAssignedSongEra(opts: {
  originalReleaseDate?: string | null;
  cachedEra?: string | null;
  youtubePublishedAt?: string | null;
  aiEra?: string | null;
}): SongEraOption | null {
  const fromOriginal = songEraFromOriginalReleaseDate(opts.originalReleaseDate);
  if (fromOriginal) return fromOriginal;
  const cached = normalizeEra(opts.cachedEra);
  if (cached && cached !== 'Other') return cached;
  const ai = normalizeEra(opts.aiEra);
  if (ai && ai !== 'Other') return ai;
  const fromYt = songEraFromYoutubePublishedAt(opts.youtubePublishedAt);
  if (fromYt) return fromYt;
  return ai ?? cached;
}

export async function getEraFromDb(
  supabase: SupabaseClient | null,
  videoId: string
): Promise<SongEraOption | null> {
  if (!supabase || !videoId.trim()) return null;

  const { data, error } = await supabase
    .from('song_era')
    .select('era')
    .eq('video_id', videoId.trim())
    .limit(1)
    .maybeSingle();

  if (error) {
    if (error.code === '42P01') return null;
    console.error('[song-era] get', error);
    return null;
  }
  return normalizeEra(data?.era);
}

export async function setEraInDb(
  supabase: SupabaseClient | null,
  videoId: string,
  era: SongEraOption
): Promise<boolean> {
  if (!supabase || !videoId.trim()) return false;

  const { error } = await supabase.from('song_era').upsert(
    { video_id: videoId.trim(), era },
    { onConflict: 'video_id' }
  );
  if (error) {
    if (error.code === '42P01') {
      console.error('[song-era] setEraInDb: song_era テーブルがありません。');
    } else {
      console.error('[song-era] setEraInDb failed', error.code, error.message);
    }
    return false;
  }
  return true;
}

async function getOriginalReleaseDateFromSongs(
  supabase: SupabaseClient | null,
  videoId: string,
  songId?: string | null,
): Promise<string | null> {
  if (!supabase) return null;
  let id = (songId ?? '').trim();
  if (!id && videoId.trim()) {
    const { data: link, error: linkErr } = await supabase
      .from('song_videos')
      .select('song_id')
      .eq('video_id', videoId.trim())
      .limit(1)
      .maybeSingle();
    if (linkErr && linkErr.code !== '42P01' && linkErr.code !== 'PGRST205') {
      console.error('[song-era] songs lookup via song_videos', linkErr);
    }
    id = typeof link?.song_id === 'string' ? link.song_id.trim() : '';
  }
  if (!id) return null;
  const { data, error } = await supabase
    .from('songs')
    .select('original_release_date')
    .eq('id', id)
    .maybeSingle();
  if (error) {
    if (error.code !== '42P01' && error.code !== 'PGRST205' && error.code !== '42703') {
      console.error('[song-era] get(songs.original_release_date)', error);
    }
    return null;
  }
  const raw = typeof data?.original_release_date === 'string' ? data.original_release_date.trim() : '';
  return raw || null;
}

/** video_id → 原盤公開年から求めた年代（表示・キャッシュ矯正用） */
export async function fetchOriginalReleaseEraByVideoIds(
  supabase: SupabaseClient | null,
  videoIds: string[],
): Promise<Map<string, SongEraOption>> {
  const out = new Map<string, SongEraOption>();
  if (!supabase || videoIds.length === 0) return out;
  const uniq = [...new Set(videoIds.map((v) => v.trim()).filter(Boolean))];
  if (uniq.length === 0) return out;

  const { data: links, error: linkErr } = await supabase
    .from('song_videos')
    .select('video_id, song_id')
    .in('video_id', uniq);
  if (linkErr) {
    if (linkErr.code !== '42P01' && linkErr.code !== 'PGRST205') {
      console.error('[song-era] fetchOriginalReleaseEraByVideoIds song_videos', linkErr);
    }
    return out;
  }

  const songIds = [
    ...new Set(
      (links ?? [])
        .map((r) => (typeof r.song_id === 'string' ? r.song_id.trim() : ''))
        .filter(Boolean),
    ),
  ];
  if (songIds.length === 0) return out;

  const { data: songs, error: songErr } = await supabase
    .from('songs')
    .select('id, original_release_date')
    .in('id', songIds);
  if (songErr) {
    if (songErr.code !== '42P01' && songErr.code !== 'PGRST205' && songErr.code !== '42703') {
      console.error('[song-era] fetchOriginalReleaseEraByVideoIds songs', songErr);
    }
    return out;
  }

  const eraBySongId = new Map<string, SongEraOption>();
  for (const row of songs ?? []) {
    const sid = typeof row.id === 'string' ? row.id.trim() : '';
    const era = songEraFromOriginalReleaseDate(
      typeof row.original_release_date === 'string' ? row.original_release_date : null,
    );
    if (sid && era) eraBySongId.set(sid, era);
  }
  for (const link of links ?? []) {
    const vid = typeof link.video_id === 'string' ? link.video_id.trim() : '';
    const sid = typeof link.song_id === 'string' ? link.song_id.trim() : '';
    const era = sid ? eraBySongId.get(sid) : undefined;
    if (vid && era) out.set(vid, era);
  }
  return out;
}

export async function getOrAssignEra(
  supabase: SupabaseClient | null,
  videoId: string,
  input: SongEraResolveInput,
  usageMeta?: { roomId?: string | null; videoId?: string | null }
): Promise<SongEraOption> {
  const originalReleaseDate =
    (input.originalReleaseDate ?? '').trim() ||
    (await getOriginalReleaseDateFromSongs(supabase, videoId, input.songId));
  const fromOriginal = songEraFromOriginalReleaseDate(originalReleaseDate);
  if (fromOriginal) {
    const cached = await getEraFromDb(supabase, videoId);
    if (cached !== fromOriginal && supabase) {
      await setEraInDb(supabase, videoId, fromOriginal);
    }
    return fromOriginal;
  }

  /** MusicBrainz: 原盤 first-release（ライブ表記は曲名正規化してスタジオ盤を優先） */
  const artist = (input.artistName ?? '').trim();
  const songTitle = (input.songTitle ?? '').trim() || (input.oembedTitle ?? '').trim();
  if (artist && songTitle) {
    try {
      const mb = await lookupMusicBrainzReleaseDate(artist, songTitle);
      const fromMb = songEraFromOriginalReleaseDate(mb?.originalReleaseDate);
      if (fromMb) {
        if (supabase) await setEraInDb(supabase, videoId, fromMb);
        return fromMb;
      }
    } catch (e) {
      console.warn(
        '[song-era] MusicBrainz lookup failed',
        e instanceof Error ? e.message : e,
      );
    }
  }

  const cached = await getEraFromDb(supabase, videoId);
  if (cached && cached !== 'Other') return cached;

  const title = input.songTitle?.trim() || input.oembedTitle?.trim() || videoId.trim() || 'Unknown';
  const eraLabel = await getSongEra(
    title,
    input.artistName ?? undefined,
    input.description ?? undefined,
    usageMeta
  );
  const normalized =
    resolveAssignedSongEra({
      originalReleaseDate: null,
      cachedEra: null,
      youtubePublishedAt: input.publishedAtIso,
      aiEra: eraLabel,
    }) ?? 'Other';
  if (supabase) await setEraInDb(supabase, videoId, normalized);
  return normalized;
}

