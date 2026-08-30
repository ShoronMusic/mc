/**
 * 気に入り軸ラボ: 種曲解決 → Gemini 選出 → カタログ照合 → 軸スコア行列。
 * 部屋チャットには接続しない。
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { extractYoutubeVideoIdFromQuery } from '@/lib/admin-song-lookup';
import { formatArtistTitle } from '@/lib/format-song-display';
import { getAdminGeminiModel } from '@/lib/gemini-admin';
import {
  generateLikedSongAxisPicks,
  LIKED_SONG_AXIS_USAGE_CTX,
  type LikedSongAxisAiPick,
} from '@/lib/liked-song-axis-generate';
import {
  catalogAxisScores,
  compositeScore,
  mergeAxisScores,
  releaseYearFromDate,
} from '@/lib/liked-song-axis-score';
import type {
  LikedSongAxisCandidate,
  LikedSongAxisLabResult,
  LikedSongAxisSeed,
  SongAxisFacts,
} from '@/lib/liked-song-axis-types';
import { extractMusic8SongFields } from '@/lib/music8-song-fields';
import {
  buildMusicaichatFactsForAiPromptBlock,
  fetchMusicaichatSongJsonForVideoId,
  getMusicaichatRecordingKind,
  type MusicaichatSongJson,
} from '@/lib/music8-musicaichat';
import { fetchMusic8SongData } from '@/lib/music8-song-lookup';
import { fetchJsonWithOptionalGcsAuth } from '@/lib/music8-gcs-server';
import { normalizeNextSongPickMatchKey } from '@/lib/next-song-recommend-store';
import { resolveNextSongPickCatalogHit } from '@/lib/next-song-recommend-catalog-resolve';
import { fetchPlaybackDisplayOverride } from '@/lib/video-playback-display-override';
import { fetchOEmbed } from '@/lib/youtube-oembed';
import { resolveArtistSongForPackAsync } from '@/lib/youtube-artist-song-for-pack';
import { getVideoSnippet } from '@/lib/youtube-search';

function watchUrlFor(videoId: string | null): string | null {
  const v = (videoId ?? '').trim();
  if (!/^[a-zA-Z0-9_-]{11}$/.test(v)) return null;
  return `https://www.youtube.com/watch?v=${v}`;
}

function emptyFacts(): SongAxisFacts {
  return {
    artist: '',
    title: '',
    year: null,
    genres: [],
    style: null,
    vocal: null,
    recordingKind: null,
  };
}

function mergeFacts(base: SongAxisFacts, extra: Partial<SongAxisFacts>): SongAxisFacts {
  const genres =
    extra.genres && extra.genres.length > 0
      ? extra.genres
      : base.genres;
  return {
    artist: (extra.artist ?? '').trim() || base.artist,
    title: (extra.title ?? '').trim() || base.title,
    year: extra.year ?? base.year,
    genres,
    style: (extra.style ?? '').trim() || base.style,
    vocal: (extra.vocal ?? '').trim() || base.vocal,
    recordingKind: (extra.recordingKind ?? '').trim() || base.recordingKind,
  };
}

function factsFromMusic8Extract(artist: string, title: string, json: unknown): SongAxisFacts {
  const ex = extractMusic8SongFields(json);
  const rec = json && typeof json === 'object' ? (json as MusicaichatSongJson) : null;
  const kind = rec ? getMusicaichatRecordingKind(rec) : '';
  return {
    artist: artist.trim(),
    title: title.trim(),
    year: releaseYearFromDate(ex.releaseDate),
    genres: ex.genres,
    style: (ex.structuredStyleFromFacts || ex.styleNames[0] || '').trim() || null,
    vocal: (ex.vocalLabel || '').trim() || null,
    recordingKind: kind || null,
  };
}

async function loadDbSongFacts(
  supabase: SupabaseClient,
  songId: string,
): Promise<{ facts: SongAxisFacts; videoId: string | null } | null> {
  const { data: song, error } = await supabase
    .from('songs')
    .select('id, main_artist, song_title, display_title, original_release_date, style, vocal, genres')
    .eq('id', songId)
    .maybeSingle();
  if (error) {
    if (error.code === '42703' || error.code === '42P01') {
      const { data: song2 } = await supabase
        .from('songs')
        .select('id, main_artist, song_title, display_title, original_release_date, style')
        .eq('id', songId)
        .maybeSingle();
      if (!song2) return null;
      return loadDbSongFactsFromRow(supabase, songId, song2 as Record<string, unknown>);
    }
    console.warn('[liked-song-axis-lab] songs', error.message);
    return null;
  }
  if (!song) return null;
  return loadDbSongFactsFromRow(supabase, songId, song as Record<string, unknown>);
}

async function loadDbSongFactsFromRow(
  supabase: SupabaseClient,
  songId: string,
  song: Record<string, unknown>,
): Promise<{ facts: SongAxisFacts; videoId: string | null } | null> {
  const artist = typeof song.main_artist === 'string' ? song.main_artist.trim() : '';
  const title = typeof song.song_title === 'string' ? song.song_title.trim() : '';
  let genres: string[] = [];
  if (Array.isArray(song.genres)) {
    genres = song.genres.filter((x: unknown) => typeof x === 'string' && x.trim()) as string[];
  }
  if (genres.length === 0) {
    const { data: sg } = await supabase
      .from('song_genres')
      .select('catalog_genres(name)')
      .eq('song_id', songId)
      .limit(12);
    if (Array.isArray(sg)) {
      for (const row of sg) {
        const nested = (row as { catalog_genres?: { name?: string } | { name?: string }[] | null })
          .catalog_genres;
        const one = Array.isArray(nested) ? nested[0] : nested;
        const name = typeof one?.name === 'string' ? one.name.trim() : '';
        if (name) genres.push(name);
      }
    }
  }

  const { data: videos } = await supabase
    .from('song_videos')
    .select('video_id')
    .eq('song_id', songId)
    .order('created_at', { ascending: true })
    .limit(1);
  const videoId = (videos?.[0] as { video_id?: string } | undefined)?.video_id?.trim() ?? '';

  return {
    facts: {
      artist,
      title,
      year: releaseYearFromDate(
        typeof song.original_release_date === 'string' ? song.original_release_date : null,
      ),
      genres,
      style: typeof song.style === 'string' && song.style.trim() ? song.style.trim() : null,
      vocal: typeof song.vocal === 'string' && song.vocal.trim() ? song.vocal.trim() : null,
      recordingKind: null,
    },
    videoId: /^[a-zA-Z0-9_-]{11}$/.test(videoId) ? videoId : null,
  };
}

async function findSongIdByVideo(
  supabase: SupabaseClient,
  videoId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('song_videos')
    .select('song_id')
    .eq('video_id', videoId)
    .limit(1)
    .maybeSingle();
  const id = (data as { song_id?: string } | null)?.song_id?.trim();
  return id || null;
}

async function searchSongsByQuery(
  supabase: SupabaseClient,
  q: string,
): Promise<{ songId: string; videoId: string | null; displayLabel: string } | null> {
  const escaped = q.replace(/%/g, '\\%').replace(/_/g, '\\_');
  const like = `%${escaped}%`;
  const { data: songs, error } = await supabase
    .from('songs')
    .select('id, display_title, main_artist, song_title')
    .or(`display_title.ilike.${like},main_artist.ilike.${like},song_title.ilike.${like}`)
    .order('display_title', { ascending: true })
    .limit(20);
  if (error || !Array.isArray(songs) || songs.length === 0) return null;
  const ids = songs.map((s: { id: string }) => s.id).filter(Boolean);
  const { data: svRows } = await supabase
    .from('song_videos')
    .select('video_id, song_id')
    .in('song_id', ids)
    .limit(40);
  const firstSv = Array.isArray(svRows) ? svRows[0] : null;
  const songId =
    (firstSv as { song_id?: string } | null)?.song_id?.trim() ||
    (songs[0] as { id?: string } | undefined)?.id?.trim() ||
    '';
  if (!songId) return null;
  const meta = songs.find((s: { id: string }) => s.id === songId) as
    | { display_title?: string | null; main_artist?: string | null; song_title?: string | null }
    | undefined;
  const displayLabel =
    (meta?.display_title ?? '').trim() ||
    `${(meta?.main_artist ?? '').trim()} - ${(meta?.song_title ?? '').trim()}`.trim() ||
    songId;
  const videoId = (firstSv as { video_id?: string } | null)?.video_id?.trim() ?? '';
  return {
    songId,
    videoId: /^[a-zA-Z0-9_-]{11}$/.test(videoId) ? videoId : null,
    displayLabel,
  };
}

async function resolveSeed(
  supabase: SupabaseClient,
  qRaw: string,
): Promise<{ seed: LikedSongAxisSeed } | { error: string }> {
  const q = qRaw.trim();
  if (!q) return { error: '検索キーが空です。' };

  let videoId = extractYoutubeVideoIdFromQuery(q);
  let songId: string | null = null;
  let displayLabel = q;
  let facts = emptyFacts();

  if (!videoId) {
    const hit = await searchSongsByQuery(supabase, q);
    if (!hit) {
      return {
        error:
          '種曲が見つかりません。YouTube の URL / video ID、または DB にある「アーティスト - タイトル」で試してください。',
      };
    }
    songId = hit.songId;
    videoId = hit.videoId;
    displayLabel = hit.displayLabel;
  }

  if (videoId && !songId) {
    songId = await findSongIdByVideo(supabase, videoId);
  }

  if (songId) {
    const db = await loadDbSongFacts(supabase, songId);
    if (db) {
      facts = mergeFacts(facts, db.facts);
      if (!videoId) videoId = db.videoId;
    }
  }

  let music8FactsBlock: string | null = null;
  let inMusic8 = false;

  if (videoId) {
    const [oembed, snippet, displayOverride, m8json] = await Promise.all([
      fetchOEmbed(videoId),
      getVideoSnippet(videoId),
      fetchPlaybackDisplayOverride(supabase, videoId),
      fetchMusicaichatSongJsonForVideoId(videoId),
    ]);
    const rawTitle = oembed?.title ?? snippet?.title ?? videoId;
    const authorName = displayOverride?.artist_name?.trim()
      ? displayOverride.artist_name.trim()
      : oembed?.author_name ?? snippet?.channelTitle ?? null;
    const title = displayOverride?.title ?? rawTitle;
    const resolved = await resolveArtistSongForPackAsync(
      title,
      authorName,
      snippet,
      videoId,
      displayOverride ? { trustProvidedTitleOverFamousPv: true } : undefined,
    );
    const artist = (resolved.artistDisplay ?? resolved.artist ?? facts.artist).trim();
    const song = (resolved.song ?? facts.title).trim();
    facts = mergeFacts(facts, { artist, title: song });
    displayLabel =
      artist && song
        ? `${artist} — ${song}`
        : formatArtistTitle(title, authorName, snippet?.description ?? null, snippet?.channelTitle ?? null);

    if (m8json) {
      inMusic8 = true;
      facts = mergeFacts(facts, factsFromMusic8Extract(artist || facts.artist, song || facts.title, m8json));
      const block = buildMusicaichatFactsForAiPromptBlock(m8json);
      music8FactsBlock = block.trim() || null;
    }
  }

  if (!facts.artist || !facts.title) {
    return { error: 'アーティスト／曲名を解決できませんでした。別のキーで試してください。' };
  }

  if ((!facts.genres.length || facts.year == null) && facts.artist && facts.title) {
    try {
      const json = await fetchMusic8SongData(facts.artist, facts.title, {
        fetchJson: fetchJsonWithOptionalGcsAuth,
      });
      if (json) {
        inMusic8 = true;
        facts = mergeFacts(facts, factsFromMusic8Extract(facts.artist, facts.title, json));
      }
    } catch {
      /* ignore */
    }
  }

  const seed: LikedSongAxisSeed = {
    ...facts,
    videoId: videoId ?? null,
    watchUrl: watchUrlFor(videoId),
    songId,
    displayLabel,
    music8FactsBlock,
    inMcDb: Boolean(songId),
    inMusic8,
  };
  return { seed };
}

async function candidateFacts(
  supabase: SupabaseClient,
  pick: LikedSongAxisAiPick,
  catalogSongId: string | null,
): Promise<SongAxisFacts> {
  let facts: SongAxisFacts = {
    artist: pick.artist,
    title: pick.title,
    year: null,
    genres: [],
    style: null,
    vocal: null,
    recordingKind: null,
  };
  if (catalogSongId) {
    const db = await loadDbSongFacts(supabase, catalogSongId);
    if (db) facts = mergeFacts(facts, db.facts);
  }
  try {
    const json = await fetchMusic8SongData(pick.artist, pick.title, {
      fetchJson: fetchJsonWithOptionalGcsAuth,
    });
    if (json) {
      facts = mergeFacts(facts, factsFromMusic8Extract(pick.artist, pick.title, json));
    }
  } catch {
    /* ignore */
  }
  return facts;
}

export async function runLikedSongAxisLab(params: {
  supabase: SupabaseClient;
  q: string;
  userId: string;
}): Promise<{ ok: true; result: LikedSongAxisLabResult } | { ok: false; error: string }> {
  const resolved = await resolveSeed(params.supabase, params.q);
  if ('error' in resolved) return { ok: false, error: resolved.error };
  const { seed } = resolved;
  const warnings: string[] = [];

  if (!getAdminGeminiModel(LIKED_SONG_AXIS_USAGE_CTX)) {
    return { ok: false, error: 'GEMINI_API_KEY が未設定です。' };
  }

  const generated = await generateLikedSongAxisPicks(seed, {
    music8FactsBlock: seed.music8FactsBlock,
    displayLabel: seed.displayLabel,
    usageMeta: { userId: params.userId, videoId: seed.videoId },
  });
  if (!generated) {
    return {
      ok: false,
      error: 'Gemini が候補を返せませんでした。API キーとモデル設定を確認してください。',
    };
  }

  const seedKey = normalizeNextSongPickMatchKey(seed.artist, seed.title);
  const seen = new Set<string>([seedKey]);
  const candidates: LikedSongAxisCandidate[] = [];

  for (const pick of generated.picks) {
    const key = normalizeNextSongPickMatchKey(pick.artist, pick.title);
    if (seen.has(key)) continue;
    seen.add(key);
    const catalogHit = await resolveNextSongPickCatalogHit(params.supabase, pick.artist, pick.title);
    const facts = await candidateFacts(params.supabase, pick, catalogHit.songId);
    const catalogScores = catalogAxisScores(seed, facts);
    const axes = mergeAxisScores(catalogScores, pick.scores);
    candidates.push({
      artist: pick.artist,
      title: pick.title,
      axis: pick.axis,
      polarity: pick.polarity,
      reasonLabel: pick.reasonLabel,
      reason: pick.reason,
      youtubeSearchQuery: pick.youtubeSearchQuery,
      catalog: {
        inMcDb: catalogHit.inMcDb,
        inMusic8: catalogHit.inMusic8,
        songId: catalogHit.songId,
        videoId: catalogHit.videoId,
        watchUrl: catalogHit.watchUrl,
      },
      composite: compositeScore(axes),
      axes,
    });
  }

  if (candidates.length === 0) {
    return { ok: false, error: '候補が種曲と重複、または空でした。再実行してください。' };
  }

  candidates.sort((a, b) => (b.composite ?? -1) - (a.composite ?? -1));

  if (!seed.inMusic8 && !seed.inMcDb) {
    warnings.push('種曲がカタログに無く、年代・ジャンル列は欠損（—）が多くなります。');
  }
  const unmatched = candidates.filter((c) => !c.catalog.inMcDb && !c.catalog.inMusic8).length;
  if (unmatched > 0) {
    warnings.push(
      `${unmatched} 曲は mc DB / Music8 に無く、カタログ列は AI 自己評価または — です。`,
    );
  }

  return {
    ok: true,
    result: {
      seed,
      salientAxes: generated.salientAxes,
      candidates,
      model: generated.model,
      warnings,
    },
  };
}
