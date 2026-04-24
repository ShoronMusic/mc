import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchOEmbed } from '@/lib/youtube-oembed';
import { formatArtistTitle } from '@/lib/format-song-display';
import { fetchUserTasteContextForChat } from '@/lib/user-ai-taste-context';
import { getVideoSnippet } from '@/lib/youtube-search';
import { resolveArtistSongForPackAsync } from '@/lib/youtube-artist-song-for-pack';
import { fetchPlaybackDisplayOverride } from '@/lib/video-playback-display-override';
import { isNextSongRecommendAllowedForUser } from '@/lib/next-song-recommend-feature';
import { checkNextSongRecommendRateLimit } from '@/lib/next-song-recommend-rate-limit';
import { generateNextSongRecommendPicks } from '@/lib/next-song-recommend-generate';
import {
  countActiveNextSongRecommendBySeedVideo,
  getActiveNextSongRecommendBySeedVideo,
  getRecentActiveNextSongRecommendations,
  insertNextSongRecommendRows,
  NEXT_SONG_RECOMMEND_MAX_STOCK,
  parseSeedLabelToArtistTitle,
} from '@/lib/next-song-recommend-store';
import { upsertSongAndVideo } from '@/lib/song-entities';

export const dynamic = 'force-dynamic';

type OkDisabled = { enabled: false; reason?: string };
type OkEnabled = { enabled: true; picks: import('@/lib/next-song-recommend-generate').NextSongPick[] };

function isNextSongRecommendDebugLogEnabled(): boolean {
  const raw = process.env.NEXT_SONG_RECOMMEND_DEBUG_LOG?.trim().toLowerCase();
  return raw === '1' || raw === 'true';
}

function isWithinOneYear(iso: string | null | undefined): boolean {
  if (!iso) return false;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return false;
  return Date.now() - t <= 365 * 24 * 60 * 60 * 1000;
}

function normalizeSongKey(artist: string, title: string): string {
  const a = artist.toLowerCase().replace(/\s+/g, ' ').trim();
  const t = title.toLowerCase().replace(/\s+/g, ' ').trim();
  return `${a}__${t}`;
}

export async function POST(request: Request): Promise<NextResponse<OkDisabled | OkEnabled>> {
  try {
    const body = await request.json().catch(() => ({}));
    const videoId = typeof body?.videoId === 'string' ? body.videoId.trim() : '';
    const roomId = typeof body?.roomId === 'string' ? body.roomId.trim() : '';
    const commentarySnippet =
      typeof body?.commentarySnippet === 'string' ? body.commentarySnippet.trim().slice(0, 2000) : '';

    if (!videoId) {
      return NextResponse.json({ enabled: false, reason: 'bad_request' }, { status: 200 });
    }

    const supabase = await createClient();
    if (!supabase) {
      return NextResponse.json({ enabled: false, reason: 'no_db' }, { status: 200 });
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    const uid = user?.id ?? null;
    if (!isNextSongRecommendAllowedForUser(uid)) {
      return NextResponse.json({ enabled: false }, { status: 200 });
    }

    const rl = checkNextSongRecommendRateLimit(uid!);
    if (!rl.ok) {
      return NextResponse.json({ enabled: false, reason: 'rate_limited' }, { status: 200 });
    }

    const reader = createAdminClient() ?? supabase;
    const [oembed, snippet] = await Promise.all([fetchOEmbed(videoId), getVideoSnippet(videoId)]);
    const rawYouTubeTitle = oembed?.title ?? snippet?.title ?? videoId;
    const displayOverride = reader ? await fetchPlaybackDisplayOverride(reader, videoId) : null;
    const title = displayOverride?.title ?? rawYouTubeTitle;
    const authorName =
      displayOverride?.artist_name?.trim()
        ? displayOverride.artist_name.trim()
        : oembed?.author_name ?? snippet?.channelTitle ?? null;

    const { artist, artistDisplay, song } = await resolveArtistSongForPackAsync(
      title,
      authorName,
      snippet,
      videoId,
      displayOverride ? { trustProvidedTitleOverFamousPv: true } : undefined,
    );

    const currentSongLabel =
      artistDisplay && song
        ? `${artistDisplay} — ${song}`
        : formatArtistTitle(title, authorName, snippet?.description ?? null, snippet?.channelTitle ?? null);
    const seedSongId =
      artistDisplay && song
        ? await upsertSongAndVideo({
            supabase: reader,
            videoId,
            mainArtist: artistDisplay,
            songTitle: song,
          })
        : artist && song
          ? await upsertSongAndVideo({
              supabase: reader,
              videoId,
              mainArtist: artist,
              songTitle: song,
            })
          : null;

    const existingCount = await countActiveNextSongRecommendBySeedVideo(reader, videoId);
    const existingBySeed = await getActiveNextSongRecommendBySeedVideo(reader, videoId, 9);
    if (existingCount >= NEXT_SONG_RECOMMEND_MAX_STOCK) {
      const dbPicks = existingBySeed
        .sort((a, b) => a.order_index - b.order_index)
        .map((r) => ({
          recommendationId: r.id,
          source: 'db' as const,
          artist: r.recommended_artist,
          title: r.recommended_title,
          reason: r.reason,
          youtubeSearchQuery: r.youtube_search_query,
        }));
      if (dbPicks.length > 0) {
        return NextResponse.json({ enabled: true, picks: dbPicks }, { status: 200 });
      }
    }

    const recentRows = await getRecentActiveNextSongRecommendations(reader, 48);
    const recentSeedLabelsOrdered: string[] = [];
    const seenSeedLabel = new Set<string>();
    for (const r of recentRows) {
      const sl = (r.seed_label ?? '').trim();
      if (!sl || seenSeedLabel.has(sl)) continue;
      seenSeedLabel.add(sl);
      recentSeedLabelsOrdered.push(sl);
      if (recentSeedLabelsOrdered.length >= 16) break;
    }

    const excludeKeySet = new Set<string>();
    const excludeSongLabels: string[] = [];
    const addExclude = (a: string, t: string) => {
      const artist = a.trim();
      const title = t.trim();
      if (!artist || !title) return;
      const k = normalizeSongKey(artist, title);
      if (excludeKeySet.has(k)) return;
      excludeKeySet.add(k);
      excludeSongLabels.push(`${artist} - ${title}`);
    };

    if (artistDisplay && song) addExclude(artistDisplay, song);
    else if (artist && song) addExclude(artist, song);

    for (const sl of recentSeedLabelsOrdered) {
      const p = parseSeedLabelToArtistTitle(sl);
      if (p) addExclude(p.artist, p.title);
    }

    for (const r of existingBySeed) {
      addExclude(r.recommended_artist, r.recommended_title);
    }

    for (const r of recentRows) {
      addExclude(r.recommended_artist, r.recommended_title);
    }

    let userTasteBlock: string | null = null;
    try {
      userTasteBlock = await fetchUserTasteContextForChat(supabase, uid!);
    } catch {
      userTasteBlock = null;
    }

    const recentWithinOneYear = isWithinOneYear(snippet?.publishedAt ?? null);
    const generated = await generateNextSongRecommendPicks(currentSongLabel, {
      userTasteBlock,
      commentarySnippet: commentarySnippet || null,
      seedPublishedAtIso: snippet?.publishedAt ?? null,
      excludeSongLabels,
      usageMeta: { roomId: roomId || null, videoId },
    });

    if (!generated || generated.length === 0) {
      return NextResponse.json({ enabled: false, reason: 'generate_failed' }, { status: 200 });
    }
    const generatedDeduped = generated.filter(
      (p) => !excludeKeySet.has(normalizeSongKey(p.artist, p.title)),
    );
    if (generatedDeduped.length === 0) {
      return NextResponse.json({ enabled: false, reason: 'all_filtered_as_duplicate' }, { status: 200 });
    }
    // popularityFit は「各おすすめ候補」に対するモデル自己申告であり、種曲がメジャーかどうかの代理にはならない
    // （例: Springsteen の次に Mellencamp 等を出すとき、候補の1件だけ niche_match でも種曲はメジャーのまま）。
    // 件数のハード上限はプロンプトの「1年以内の新曲」に合わせ、種曲の公開日のみで 1 vs 3 を切る。
    const maxPicksByRule = recentWithinOneYear ? 1 : 3;
    const generatedCapped = generatedDeduped.slice(0, maxPicksByRule);
    if (generatedCapped.length === 0) {
      return NextResponse.json({ enabled: false, reason: 'generate_failed' }, { status: 200 });
    }
    const rest = Math.max(0, NEXT_SONG_RECOMMEND_MAX_STOCK - existingCount);
    const toSave = generatedCapped.slice(0, Math.min(maxPicksByRule, rest));
    const insertedRows =
      toSave.length > 0
        ? await insertNextSongRecommendRows(reader, {
            seedSongId,
            seedVideoId: videoId,
            seedLabel: currentSongLabel,
            picks: toSave,
          })
        : [];
    const picks: import('@/lib/next-song-recommend-generate').NextSongPick[] =
      insertedRows.length > 0
        ? insertedRows
            .sort((a, b) => a.order_index - b.order_index)
            .map((r) => ({
              recommendationId: r.id,
              source: 'new',
              artist: r.recommended_artist,
              title: r.recommended_title,
              reason: r.reason,
              youtubeSearchQuery: r.youtube_search_query,
            }))
        : generatedCapped.map((p) => ({ ...p, source: 'new' as const }));

    if (isNextSongRecommendDebugLogEnabled()) {
      console.log(
        JSON.stringify({
          t: 'next_song_recommend_debug',
          ts: new Date().toISOString(),
          roomId: roomId || null,
          videoId,
          userId: uid,
          currentSongLabel,
          hasUserTasteBlock: Boolean(userTasteBlock && userTasteBlock.trim()),
          hasCommentarySnippet: Boolean(commentarySnippet),
          seedSongId: seedSongId ?? null,
          existingCount,
          insertedCount: insertedRows.length,
          recentWithinOneYear,
          anyPickNicheMatch: generatedDeduped.some((p) => p.popularityFit === 'niche_match'),
          maxPicksByRule,
          picks: picks.map((p) => ({
            recommendationId: p.recommendationId ?? null,
            source: p.source ?? 'new',
            artist: p.artist,
            title: p.title,
            reason: p.reason,
            youtubeSearchQuery: p.youtubeSearchQuery,
            whyTags: p.whyTags ?? [],
            eraFit: p.eraFit ?? 'unknown',
            popularityFit: p.popularityFit ?? 'unknown',
            selectionNote: p.selectionNote ?? '',
          })),
        }),
      );
    }

    return NextResponse.json({ enabled: true, picks }, { status: 200 });
  } catch (e) {
    console.error('[api/ai/next-song-recommend]', e);
    return NextResponse.json({ enabled: false, reason: 'server_error' }, { status: 200 });
  }
}
