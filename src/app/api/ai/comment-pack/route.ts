import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { fetchOEmbed } from '@/lib/youtube-oembed';
import { isJpDomesticOfficialChannelAiException } from '@/lib/jp-official-channel-exception';
import { resolveJapaneseEconomyWithMusicBrainz } from '@/lib/resolve-japanese-economy';
import {
  buildAiCommentaryPromptLabels,
  colorsStudiosTrustsOembedArtistFirst,
  isAppleMusicChannelAuthor,
  isGeniusChannelAuthor,
  shouldSkipAiCommentaryForPromotionalOrProseMetadata,
  shouldSkipAiCommentaryForUncertainArtistResolution,
} from '@/lib/format-song-display';
import {
  resolveArtistSongForPackAsync,
  type ResolveArtistSongForPackOptions,
} from '@/lib/youtube-artist-song-for-pack';
import { sessionMayEditRoomPlaybackHistoryFields } from '@/lib/admin-access';
import {
  applyPlaybackDisplayHintWhenDbMissing,
  fetchPlaybackDisplayOverride,
  parseAdminPlaybackDisplayHint,
} from '@/lib/video-playback-display-override';
import { getVideoSnippet } from '@/lib/youtube-search';
import { containsUnreliableCommentPackClaim } from '@/lib/ai-output-policy';
import {
  extractTextFromGenerateContentResponse,
  isGemmaHostedModelId,
  polishGemmaModelVisibleText,
} from '@/lib/gemini-gemma-host';
import { getGeminiModel, logGeminiUsage } from '@/lib/gemini';
import { resolveGenerationModelId } from '@/lib/gemini-model-routing';
import { persistGeminiUsageLog } from '@/lib/gemini-usage-log';
import { createAdminClient } from '@/lib/supabase/admin';
import { upsertSongAndVideo } from '@/lib/song-entities';
import { isDevMinimalSongAi } from '@/lib/dev-minimal-song-ai';
import {
  COMMENT_PACK_MAX_FREE_COMMENTS,
  COMMENT_PACK_NEW_RELEASE_DISCLAIMER,
  COMMENT_PACK_SOURCES,
  getStoredCommentPackByVideoId,
  getStoredNewReleaseCommentPack,
  insertTidbit,
} from '../../../../lib/song-tidbits';
import { isRoomJpAiUnlockEnabled } from '@/lib/room-jp-ai-unlock-server';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  type CommentPackSlotSelection,
  equivalentBaseOnlySlots,
  isCommentPackFullyOff,
  normalizeCommentPackSlotsFromRequestBody,
  parseOptionalFreeSlotIndex,
} from '@/lib/comment-pack-slots';
import { buildSupergroupPromptBlock } from '@/lib/supergroup-artist';
import {
  buildCommentPackSessionContextBlock,
  generateCommentPackSessionBridge,
  isCommentPackSessionContextEnabled,
  normalizeCommentPackRecentMessages,
} from '@/lib/comment-pack-session-context';
import {
  buildMusicaichatFactsForAiPromptBlock,
  resolveMusic8ContextForCommentPack,
  shouldRegenerateLibraryWhenMusicaichatSong,
  skipMusic8FactInjectEnv,
} from '@/lib/music8-musicaichat';

export const dynamic = 'force-dynamic';

/** クライアント表示用にスロットで本文を絞る（tidbitIds はそのまま渡し、空本文のメッセージは出さない） */
function applySlotsToPackBodies(
  baseComment: string,
  freeComments: string[],
  slots: CommentPackSlotSelection,
): { baseComment: string; freeComments: string[] } {
  const f = [
    typeof freeComments[0] === 'string' ? freeComments[0] : '',
    typeof freeComments[1] === 'string' ? freeComments[1] : '',
    typeof freeComments[2] === 'string' ? freeComments[2] : '',
  ];
  return {
    baseComment: slots[0] ? baseComment : '',
    freeComments: [slots[1] ? f[0] : '', slots[2] ? f[1] : '', slots[3] ? f[2] : ''],
  };
}

/** YouTube 動画の公開日がこの日数以内なら「新曲」とみなし、基本コメントのみ出す */
const NEW_RELEASE_DAYS = 30;

function normalizeForDuplicateCheck(text: string): string {
  return text
    .toLowerCase()
    .replace(/[「」『』（）()\[\]、。.,!?！？:：;；"'`]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenizeForDuplicateCheck(text: string): string[] {
  const normalized = normalizeForDuplicateCheck(text);
  if (!normalized) return [];
  return normalized.split(' ').filter((t) => t.length >= 2);
}

function overlapRatio(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let inter = 0;
  Array.from(setA).forEach((t) => {
    if (setB.has(t)) inter += 1;
  });
  const minSize = Math.min(setA.size, setB.size);
  return minSize > 0 ? inter / minSize : 0;
}

function isSimilarToExistingComment(candidate: string, existing: string[]): boolean {
  const cand = normalizeForDuplicateCheck(candidate);
  if (!cand) return false;
  const candTokens = tokenizeForDuplicateCheck(cand);
  for (const e of existing) {
    const ex = normalizeForDuplicateCheck(e);
    if (!ex) continue;
    if (cand === ex) return true;
    if (cand.length >= 24 && ex.includes(cand)) return true;
    if (ex.length >= 24 && cand.includes(ex)) return true;
    const ratio = overlapRatio(candTokens, tokenizeForDuplicateCheck(ex));
    if (ratio >= 0.68) return true;
  }
  return false;
}

function hasSupergroupContext(text: string): boolean {
  const t = (text ?? '').trim();
  if (!t) return false;
  return /スーパーグループ|結成|メンバー|元メンバー|参加/.test(t);
}

/** [DB] 返却時のみ。固定本文の前に会話つなぎを付ける（失敗時は元の本文）。 */
async function prependLibrarySessionBridge(
  baseComment: string,
  ctx: {
    sessionBlock: string;
    artistLabel: string;
    songLabel: string;
    videoId: string;
    roomId: string;
  },
): Promise<string> {
  const trimmed = baseComment.trim();
  if (!ctx.sessionBlock.trim() || !trimmed) return baseComment;
  const model = getGeminiModel('comment_pack_session_bridge');
  if (!model) return baseComment;
  const br = await generateCommentPackSessionBridge(
    model,
    {
      sessionBlock: ctx.sessionBlock,
      artistLabel: ctx.artistLabel,
      songLabel: ctx.songLabel,
      fixedCommentary: trimmed,
    },
    { videoId: ctx.videoId, roomId: ctx.roomId || null },
  );
  if (!br?.trim()) return baseComment;
  const joined = `${br.trim()}\n\n${trimmed}`;
  /** bridge は extract で polish 済みでも、結合直後にだけ残るメタがあるため Gemma 時は全体を再 polish */
  const gemmaPackOrBridge =
    isGemmaHostedModelId(resolveGenerationModelId('comment_pack_session_bridge')) ||
    isGemmaHostedModelId(resolveGenerationModelId('comment_pack_base'));
  return gemmaPackOrBridge ? polishGemmaModelVisibleText(joined) : joined;
}

/** frees フェーズで ai_chat_1〜3 の現行 tidbit id を集める（単枠 upsert 後の tidbitIds 用） */
async function fetchCommentPackChatTidbitIds(
  dbWrite: SupabaseClient,
  videoId: string,
  baseRowId: string,
): Promise<(string | null)[]> {
  const freeSources = ['ai_chat_1', 'ai_chat_2', 'ai_chat_3'] as const;
  const out: (string | null)[] = [baseRowId];
  for (const src of freeSources) {
    const { data, error } = await dbWrite
      .from('song_tidbits')
      .select('id')
      .eq('video_id', videoId.trim())
      .eq('source', src)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error && error.code !== '42P01') {
      console.warn('[api/ai/comment-pack] fetch chat tidbit id', src, error.message);
    }
    out.push(typeof data?.id === 'string' ? data.id : null);
  }
  return out;
}

function isPublishedWithinLastDays(publishedAtIso: string | undefined, days: number): boolean {
  if (!publishedAtIso || typeof publishedAtIso !== 'string') return false;
  const d = new Date(publishedAtIso.trim());
  if (Number.isNaN(d.getTime())) return false;
  const now = Date.now();
  const diffMs = now - d.getTime();
  if (diffMs < 0) return false;
  return diffMs <= days * 24 * 60 * 60 * 1000;
}

/**
 * artistDisplay（カンマ区切りの複数クレジット）を検出したとき、共演・フィーチャリング向けの追指示。
 */
function buildCollaborationPromptBlock(
  mainArtist: string | null | undefined,
  artistDisplayLabel: string,
): string {
  const raw = artistDisplayLabel.trim();
  if (!raw) return '';
  const parts = raw
    .split(',')
    .map((s) => s.trim())
    .filter((p) => p.length > 0 && !/^(feat\.?|ft\.?|featuring)$/i.test(p));
  if (parts.length < 2) return '';
  const names = parts.join('、');
  const main = (mainArtist ?? '').trim();
  const secondary = main
    ? parts.filter((p) => p.toLowerCase() !== main.toLowerCase())
    : parts.slice(1);
  const secondaryHint =
    secondary.length > 0
      ? `・メインと別枠のクレジット（${secondary.join('、')}）は、**曲の中での音楽的役割**（例：メインの歌に対するラップ・フック・コーラス）を必ず踏まえ、片方だけの紹介で終わらせないこと。\n`
      : '';
  return `【コラボ・共演（${parts.length}名）】
・メタデータ上、この曲には複数名のクレジットが関わっています（${names}）。**解説全体を通じ、可能な限り複数人に触れてください**。
${secondaryHint}・世界的知名度の高い客演者がいる一曲では、その参加がトラックにもたらした**対比・掛け合い・話題性**を、**広く知られる事実の範囲**で述べてください（例：ラップ／歌唱の役割分担が曲の特徴になっている、など）。
・「共演が実現した経緯・当人同士の関係性」は、**公的に繰り返し語られている内容**に限ります。裏付けのない私人話・根拠のない制作秘話は書かないこと。
・各スロット（基本・栄誉・歌詞・サウンド）で**同じ趣旨の焼き直し**にせず、観点を分けてください。
`;
}

/**
 * 曲ごとのコメントパック生成API
 * - 基本コメント1本 + 自由コメント最大3本（1:栄誉・チャート 2:歌詞 3:サウンド）をまとめて生成する
 * - 動画公開から30日以内は「新曲」とみなし、基本コメントのみ（末尾に注釈）。自由3本は生成しない
 * - 同一動画は song_tidbits から再利用（新曲は注釈付き基本のみキャッシュ、それ以外は4本そろいでキャッシュ）
 * - 邦楽節約: メタデータが日本語っぽい／音声言語が ja／MusicBrainz で Area=Japan 等のときは AI 曲解説を出さない（skipAiCommentary）。ただし ONE OK ROCK / XG / Ado / ATARASHII GAKKO!（＋88rising）/ YOASOBI の公式 YouTube チャンネル（channelId 固定＋ env 追加分）は除外。COMMENT_PACK_JP_ECONOMY=0 でオフ
 * - COMMENT_PACK_SKIP_CACHE=1 で常に新規生成
 * - musicaichat 曲 JSON が取れ、Music8 注入オン時は既定で [DB] キャッシュを使わず再生成（`COMMENT_PACK_REGENERATE_LIBRARY_WHEN_MUSIC8=0` でオフ）。`/api/ai/commentary` も同条件
 * - NEXT_PUBLIC_DEV_MINIMAL_SONG_AI=1 で開発簡略: 基本1本のみ生成・キャッシュ返却も自由3本を落とす（新曲30日以内扱いと同様）
 * - 自由コメント3本の**初回生成は並列**（基本のあと Promise.all）。ポリシー・重複検証に落ちた枠だけ従来どおり逐次リトライ（遅いモデルでもレスポンスが返るまでの壁時計時間を短縮）
 * - **packPhase=base**: 基本だけ生成し DB に ai_commentary のみ保存して即 JSON 返却（遅いモデルでも最初の解説を先に出せる）。**packPhase=frees**: 直前の基本文と一致する ai_commentary を前提に自由3本だけ生成し ai_chat_* のみ差し替え
 * - メタからアーティストを信頼できない（曲名も空・キュレーターchでアップローダー名=アーティスト等）は skipAiCommentary。AI_COMMENTARY_ALLOW_UNCERTAIN_ARTIST=1 で無効化
 * - YouTube タイトル／説明が宣伝文・長文プローズっぽいときは skipAiCommentary（skipReason: promotional_metadata）。視聴履歴の表記修正でタイトルが付いているときはスキップしない。AI_COMMENTARY_SKIP_PROMO_METADATA=0 で無効化
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const videoId = typeof body?.videoId === 'string' ? body.videoId.trim() : '';
    const roomId = typeof body?.roomId === 'string' ? body.roomId.trim() : '';
    const slots = normalizeCommentPackSlotsFromRequestBody(body);
    if (!videoId) {
      return NextResponse.json({ error: 'videoId is required' }, { status: 400 });
    }

    const packPhaseRaw = typeof body?.packPhase === 'string' ? body.packPhase.trim().toLowerCase() : '';
    const packPhase: 'base' | 'frees' | null =
      packPhaseRaw === 'base' ? 'base' : packPhaseRaw === 'frees' ? 'frees' : null;

    const sessionMsgs = isCommentPackSessionContextEnabled()
      ? normalizeCommentPackRecentMessages(body?.recentMessages)
      : [];
    const sessionBlock = buildCommentPackSessionContextBlock(sessionMsgs);
    const sessionPromptBlock =
      sessionBlock.length > 0
        ? `【直近のチャット（参考。会話の逐語繰り返し禁止。【メタデータの前提】と矛盾する推測はしない）】\n${sessionBlock}\n\n`
        : '';

    const skipCommentPackCacheRequested = body?.skipCommentPackCache === true;
    const adminPlaybackHintRaw = parseAdminPlaybackDisplayHint(body?.adminPlaybackDisplayHint);

    const supabase = await createClient();
    if (skipCommentPackCacheRequested) {
      const allowed = await sessionMayEditRoomPlaybackHistoryFields(supabase);
      if (!allowed) {
        return NextResponse.json(
          {
            error:
              'skipCommentPackCache は、視聴履歴の表記修正と同じ条件（STYLE_ADMIN_USER_IDS 設定時は該当アカウントのみ）で利用できます。',
          },
          { status: 403 },
        );
      }
    }

    const reader = createAdminClient() ?? supabase;

    const [oembed, snippet] = await Promise.all([
      fetchOEmbed(videoId),
      getVideoSnippet(videoId, { roomId: roomId || undefined, source: 'api/ai/comment-pack' }),
    ]);

    const rawYouTubeTitleForPrompt = oembed?.title ?? snippet?.title ?? videoId;
    let displayOverride = reader ? await fetchPlaybackDisplayOverride(reader, videoId) : null;
    if (skipCommentPackCacheRequested && adminPlaybackHintRaw) {
      displayOverride = applyPlaybackDisplayHintWhenDbMissing(displayOverride, adminPlaybackHintRaw);
    }
    const title = displayOverride?.title ?? rawYouTubeTitleForPrompt;
    const authorName =
      displayOverride?.artist_name?.trim() ? displayOverride.artist_name.trim() : oembed?.author_name;
    const resolvePackOpts: ResolveArtistSongForPackOptions | undefined = displayOverride
      ? { trustProvidedTitleOverFamousPv: true }
      : undefined;
    const { artist, artistDisplay, song } = await resolveArtistSongForPackAsync(
      title,
      authorName,
      snippet,
      videoId,
      resolvePackOpts,
    );

    const isNewRelease = isPublishedWithinLastDays(snippet?.publishedAt, NEW_RELEASE_DAYS);
    const devMinimalSongAi = isDevMinimalSongAi();
    const isJpEconomy = await resolveJapaneseEconomyWithMusicBrainz({
      title,
      artistDisplay,
      artist,
      song,
      description: snippet?.description ?? null,
      channelTitle: snippet?.channelTitle ?? null,
      defaultAudioLanguage: snippet?.defaultAudioLanguage ?? null,
    });
    const roomJpAiUnlock = roomId ? await isRoomJpAiUnlockEnabled(roomId) : false;
    const jpAiUnlockEnabled = roomJpAiUnlock;
    /** 新曲のみ基本1本（自由3本なし）。開発フラグ時も同様。邦楽は公式チャンネル例外を除き生成しない */
    const baseOnlyPack = equivalentBaseOnlySlots(slots) || isNewRelease || devMinimalSongAi;

    if (isCommentPackFullyOff(slots)) {
      return NextResponse.json({ videoId, disabledByOwner: true, baseComment: '', freeComments: [] });
    }

    // songs / song_videos 登録＋ song_id
    let songId: string | null = null;
    try {
      songId = await upsertSongAndVideo({
        supabase,
        videoId,
        mainArtist: artist ?? authorName ?? null,
        songTitle: song ?? title,
        variant: 'tidbit',
      });
    } catch (e) {
      console.error('[api/ai/comment-pack] upsertSongAndVideo', e);
    }

    if (isJpEconomy && !isJpDomesticOfficialChannelAiException(snippet?.channelId) && !jpAiUnlockEnabled) {
      return NextResponse.json({ skipAiCommentary: true, songId, videoId, skipReason: 'jp_economy' });
    }

    if (
      shouldSkipAiCommentaryForUncertainArtistResolution({
        artist,
        artistDisplay,
        song,
        authorName,
        title,
      })
    ) {
      return NextResponse.json({
        skipAiCommentary: true,
        songId,
        videoId,
        skipReason: 'uncertain_artist',
      });
    }

    const hasTrustedDisplayTitle = Boolean(displayOverride?.title?.trim());
    if (
      !hasTrustedDisplayTitle &&
      shouldSkipAiCommentaryForPromotionalOrProseMetadata({
        rawYouTubeTitle: rawYouTubeTitleForPrompt,
        song,
        snippetDescription: snippet?.description ?? null,
      })
    ) {
      return NextResponse.json({
        skipAiCommentary: true,
        songId,
        videoId,
        skipReason: 'promotional_metadata',
      });
    }

    const artistLookupForMusic8 =
      (artistDisplay && artistDisplay.trim()) ||
      (artist && artist.trim()) ||
      (authorName && authorName.trim()) ||
      '';
    const music8Ctx = await resolveMusic8ContextForCommentPack(videoId, artistLookupForMusic8);
    const { musicaichatSong } = music8Ctx;
    const skipMusic8FactInject = skipMusic8FactInjectEnv();
    const bypassLibraryCacheForMusic8 = shouldRegenerateLibraryWhenMusicaichatSong(
      musicaichatSong,
      skipMusic8FactInject,
    );
    const music8ModeratorHintsPayload =
      music8Ctx.artistJsonHit || music8Ctx.songJsonHit
        ? {
            music8ModeratorHints: {
              artistJsonHit: music8Ctx.artistJsonHit,
              songJsonHit: music8Ctx.songJsonHit,
            },
          }
        : {};

    const aiPromptLabels = buildAiCommentaryPromptLabels({
      artistDisplay,
      artist,
      authorName: authorName ?? null,
      song,
      titleFallback: title,
    });
    const artistLabelPre =
      aiPromptLabels.artistLabel.trim() ||
      artistDisplay ||
      artist ||
      authorName ||
      'Unknown Artist';
    const songLabelForAiPrompt = aiPromptLabels.songLabel.trim() || song || title;
    const supergroupBlockPre = await buildSupergroupPromptBlock(artistLabelPre);
    const isSupergroupArtist = supergroupBlockPre.trim().length > 0;

    const skipCache =
      process.env.COMMENT_PACK_SKIP_CACHE === '1' ||
      skipCommentPackCacheRequested ||
      bypassLibraryCacheForMusic8;
    /** Gemma で誤って DB に保存された英語CoT混入を、キャッシュ返却時に除去 */
    const polishCachedBodiesForGemma = isGemmaHostedModelId(
      resolveGenerationModelId('comment_pack_base'),
    );
    if (!skipCache && packPhase !== 'frees') {
      if (isNewRelease) {
        const nrCached = await getStoredNewReleaseCommentPack(reader, videoId);
        if (nrCached) {
          if (isSupergroupArtist && !hasSupergroupContext(nrCached.baseComment)) {
            // 旧キャッシュでスーパーグループ背景が欠ける場合は再生成を優先
          } else {
            let baseOut = polishCachedBodiesForGemma
              ? polishGemmaModelVisibleText(nrCached.baseComment)
              : nrCached.baseComment;
            if (sessionBlock) {
              baseOut = await prependLibrarySessionBridge(baseOut, {
                sessionBlock,
                artistLabel: artistLabelPre,
                songLabel: songLabelForAiPrompt,
                videoId,
                roomId,
              });
            }
            return NextResponse.json({
              songId,
              videoId,
              baseComment: baseOut,
              freeComments: [],
              source: 'library',
              newReleaseOnly: true,
              ...(nrCached.tidbitIds?.length ? { tidbitIds: nrCached.tidbitIds } : {}),
              ...music8ModeratorHintsPayload,
            });
          }
        }
      } else {
        const cached = await getStoredCommentPackByVideoId(reader, videoId);
        if (cached) {
          if (isSupergroupArtist && !hasSupergroupContext(cached.baseComment)) {
            // 旧キャッシュでスーパーグループ背景が欠ける場合は再生成を優先
          } else {
            const filtered = applySlotsToPackBodies(cached.baseComment, [...cached.freeComments], slots);
            let baseOutLib = filtered.baseComment;
            const freePolished = polishCachedBodiesForGemma
              ? filtered.freeComments.map((c) =>
                  typeof c === 'string' && c.trim() ? polishGemmaModelVisibleText(c) : c,
                )
              : filtered.freeComments;
            if (polishCachedBodiesForGemma && baseOutLib.trim()) {
              baseOutLib = polishGemmaModelVisibleText(baseOutLib);
            }
            if (sessionBlock && baseOutLib.trim()) {
              baseOutLib = await prependLibrarySessionBridge(baseOutLib, {
                sessionBlock,
                artistLabel: artistLabelPre,
                songLabel: songLabelForAiPrompt,
                videoId,
                roomId,
              });
            }
            const tidbitIdsFull = cached.tidbitIds ?? [];
            const freeCommentTidbitIds = tidbitIdsFull.length > 1 ? tidbitIdsFull.slice(1) : [];
            return NextResponse.json({
              songId,
              videoId,
              baseComment: baseOutLib,
              freeComments: freePolished,
              source: 'library',
              ...(tidbitIdsFull.length ? { tidbitIds: tidbitIdsFull } : {}),
              ...(freeCommentTidbitIds.length > 0 ? { freeCommentTidbitIds } : {}),
              ...music8ModeratorHintsPayload,
            });
          }
        }
      }
    }

    const model = getGeminiModel('comment_pack_base');
    if (!model) {
      return NextResponse.json(
        { error: 'Gemini is not configured' },
        { status: 503 },
      );
    }

    const currentYear = new Date().getFullYear();
    const artistLabel = artistLabelPre;
    const songLabel = songLabelForAiPrompt;
    const rawYouTubeTitle = rawYouTubeTitleForPrompt;

    const colorsOfficialLock = colorsStudiosTrustsOembedArtistFirst(authorName, title)
      ? `・COLORS（A COLORS SHOW）公式配信: 「${artistLabel}」＝アーティスト、「${songLabel}」＝曲名で確定。逆の対応・別読み・言い逃れは禁止。\n`
      : '';

    const geniusOfficialLock = isGeniusChannelAuthor(authorName)
      ? `・Genius 公式チャンネル: タイトル先頭の「Genius」はメディア名です。「${artistLabel}」＝アーティスト、「${songLabel}」＝曲名のみを正とし、Genius をアーティストや「彼ら」の指す先にしないこと。\n`
      : '';

    const appleMusicOfficialLock = isAppleMusicChannelAuthor(authorName)
      ? `・Apple Music 公式チャンネル: タイトル先頭の「Apple Music」は配信プラットフォーム名です。「${artistLabel}」＝アーティスト、「${songLabel}」＝曲名のみを正とし、Apple Music をアーティストや「彼ら」の指す先にしないこと。\n`
      : '';

    const collaborationBlock = buildCollaborationPromptBlock(artist, artistLabel);
    const supergroupBlock = supergroupBlockPre;

    const adminTitleHint = displayOverride
      ? `・**アーティスト名・曲名の正**: 視聴履歴の管理者修正（DB）の表記「${title}」を前提に分解した【アーティスト】【曲名】を使っています。YouTube 原文と異なる場合は必ずこちらに従うこと。\n`
      : '';

    const music8FactsBlockTrimmed =
      !skipMusic8FactInject && musicaichatSong != null
        ? buildMusicaichatFactsForAiPromptBlock(musicaichatSong).trim()
        : '';
    const music8FactsSection =
      music8FactsBlockTrimmed.length > 0 ? `\n${music8FactsBlockTrimmed}\n` : '';
    const music8SourcePolicyLine =
      music8FactsSection.length > 0
        ? `・下記【Music8 参照事実】はマスター由来の要約です。**記載のリリース時期・ジャンル分類・アルバム名などと本文を矛盾させないこと。**参照に無い受賞・チャート順位・固有名は捏造しないこと。参照と YouTube メタが明確に食い違うときは断定を避け、メタデータ優先でよい。`
        : `・本APIは Music8 等の外部楽曲DBを参照していません。根拠のない固有名・年号を作らないこと。`;

    const metaLockBlock = `【メタデータの前提（厳守）】
${adminTitleHint}・YouTube 動画タイトル（原文）: ${rawYouTubeTitle}
・【アーティスト（歌手・バンド）】= 「${artistLabel}」。カンマ区切りは**複数の歌唱・演奏クレジット**（共演・フィーチャリング）を表す。各名を曲名と取り違えないこと。
・【曲名】= 「${songLabel}」のみ。これは楽曲のタイトルです。
・重要：曲名に含まれる英単語「With」は**共演者をつなぐ語ではなくタイトルの一部**です（例: 『Die With A Smile』全体が曲名）。【曲名】を短くした別名にしたり、「With」以降を別人名として新たな共演者にしたりしないこと。架空のアルバム名・プロジェクト名を作らないこと。
${colorsOfficialLock}${geniusOfficialLock}${appleMusicOfficialLock}
${supergroupBlock}
・YouTube タイトルに「 • 」「 · 」のあとに続く語（TopPop、番組名など）が付いていても、それは**曲名の一部ではない**。【曲名】は「${songLabel}」のみとし、番組名を曲名や『』の中に含めないこと。
・絶対禁止: 「${songLabel}」をアーティスト名のように扱い、「${artistLabel}」を曲名のように扱うこと（例:「${songLabel}の代表曲『${artistLabel}』」は誤り。正しくは「${artistLabel}の『${songLabel}』」）。
・禁止: 【曲名】を「の」の前に、【アーティスト】を全角かぎかっこ『』の内側に入れる書き方（例:「Back Togetherの『SZA ft. Tame Impala』は〜」）。『』で囲むのは【曲名】${songLabel}のみ。
・「〜の代表曲」は必ず アーティスト → 曲 の順で書く（${artistLabel} の代表曲として『${songLabel}』、など）。
・アーティスト名と曲名を入れ替えたり、別の架空の曲として語らないこと。
・タイトル・チャンネル名と矛盾するリリース年・アルバム名・編成・未来の年号は書かない。不明・不確実ならその一句を省くか「〜として知られる」など弱い表現にとどめる。
${music8SourcePolicyLine}
・【曲名】は既に (Official Video)・(Lyric Video) など**公式動画・配信向けの副題を除いた**表記です。本文では【曲名】の表記どおり使うこと。**Remix・Remaster が【曲名】に含まれるときは省略せず**そのまま書く（勝手に短くしない）。${music8FactsSection}`;

    // 1. 基本コメント（/commentary と似た役割だが、このAPI専用に少し短めに生成）
    const basePromptTail = isNewRelease
      ? `・この動画は公開から約1ヶ月以内の新曲扱いです。周辺情報が不十分な可能性があるため、断定を避け、分かる範囲の紹介にとどめてください（推測や詳細な背景説明は控えめに）。
・この後に自由コメントは出しません。ここ1本で完結する基本紹介にしてください。`
      : devMinimalSongAi || equivalentBaseOnlySlots(slots)
        ? `・開発中モードのため、自由コメントは生成しません。ここ1本で完結する基本紹介にしてください。`
        : `・この1本は「基本情報」専用です。あとから3本の自由コメント（解釈・サウンド・栄誉など）が続くため、ここでは深い解説や歌詞の細かい読み下しは書かないでください。`;

    const baseExcludeChartsBlock = isSupergroupArtist
      ? `・チャート順位、週数、売上、グラミー等の受賞・ノミネート、メディアやSNSの**反響**の**具体**（スーパーグループでは後続の自由コメントでもこれらを**主題にしません**。**自由コメント1本目**で**各メンバーの氏名と元所属の紹介**を優先します）`
      : `・チャート順位、週数、売上、グラミー等の受賞・ノミネートの**具体**（これらは後続の自由コメント1本目で扱います）`;

    const baseIncludeSupergroupLine = isSupergroupArtist
      ? `・スーパーグループのユニットの場合、**結成やラインナップの一端**を1文以内で触れてよいが、**主要メンバー全員の氏名の列挙は自由コメント1本目**に任せ、ここでは作品の年・雰囲気の核にとどめてください。\n`
      : '';

    const baseOptionalExtrasBlock = isSupergroupArtist
      ? `【基本情報に足してよい一言（任意）】
・【曲名】やタイトル原文から**リミックス版・別ミックス**と分かるときは、基本紹介内でその版に一言触れてよい（オリジナルよりこのミックスの方が後からメインになった、なども珍しいわけではない。不確かなら弱い表現か省略）。`
      : `【基本情報に足してよい一言（任意）】
・広く知られた大ヒット曲に限り、テーマの要約のあとに**一文だけ**「2010年代前半に世界的なヒットとなった」など、**時期＋規模の枠**を添えてよい（チャート名・順位・週数は書かない。具体は1本目の自由コメントに任せる）。
・【曲名】やタイトル原文から**リミックス版・別ミックス**と分かるときは、基本紹介内でその版に一言触れてよい（オリジナルよりこのミックスの方が後からメインになった、なども珍しいわけではない。不確かなら弱い表現か省略）。`;

    const basePrompt = `選曲アナウンスの直後に、最初にだけ表示する「曲の基本情報」を1本だけ書いてください。現在は${currentYear}年です。
${metaLockBlock}
${collaborationBlock}
${sessionPromptBlock}
【書き出しの型（必須）】
・本文の最初の文は、必ず「${artistLabel}の『${songLabel}』」で始めてください（全角かぎかっこ『』で曲名を囲む）。別の言い回しで始めないこと。
・続けてリリース年・アルバム・雰囲気を同じ段落内で述べてください。

【基本情報に含めるもの（この順で簡潔に）】
・リリース年（分かる範囲）
・収録アルバム名（分かれば）
・ジャンルや当時の位置づけを一言（例：ニューウェーブ全盛期の代表曲のひとつ、など）
・クレジットが複数いる場合は、**同じ段落内で**メインと客演の**役割の違い**をそれぞれ一言（例：一方が歌、他方がラップ／フック）触れてください。
・曲のテーマや雰囲気を1文（解釈は深掘りしない。概要だけ）
${baseIncludeSupergroupLine}
【基本情報に含めないもの】
${baseExcludeChartsBlock}
・歌詞の詳細な読解や論争の紹介（自由コメント側）
・楽器パートの細かい分析（自由コメント側）

${baseOptionalExtrasBlock}

・80〜150文字程度、日本語、です・ます調。
・出力はチャットに表示する日本語の解説本文のみ。英語の思考過程・メタメモ・箇条書きは禁止。
・バンド名とリリース年から体制変更の特筆事項（故メンバーの逝去・活動休止・新ボーカル加入など）を知っている場合は、簡潔にひと言触れてよい。故人を「いま歌っている」と誤解されないようにする。
${basePromptTail}`;

    const commentPackModelId = resolveGenerationModelId('comment_pack_base');

    let baseText: string;

    if (packPhase === 'frees') {
      let fromClient = typeof body?.baseComment === 'string' ? body.baseComment.trim() : '';
      if (!fromClient && reader) {
        const { data: row } = await reader
          .from('song_tidbits')
          .select('body')
          .eq('video_id', videoId)
          .eq('source', 'ai_commentary')
          .eq('is_active', true)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        fromClient = typeof row?.body === 'string' ? row.body.trim() : '';
      }
      if (!fromClient) {
        return NextResponse.json(
          { error: 'baseComment または DB の ai_commentary が必要です（先に packPhase=base を実行してください）' },
          { status: 400 },
        );
      }
      baseText = fromClient;
    } else {
      const baseResult = await model.generateContent(basePrompt);
      logGeminiUsage('comment_pack_base', baseResult.response);
      await persistGeminiUsageLog('comment_pack_base', baseResult.response.usageMetadata, { videoId });
      baseText = extractTextFromGenerateContentResponse(baseResult.response, commentPackModelId);
      if (isNewRelease) {
        baseText = (baseText + COMMENT_PACK_NEW_RELEASE_DISCLAIMER).trim();
      }

      const filteredEarlyBaseOnly = applySlotsToPackBodies(baseText.trim(), ['', '', ''], slots);
      if (
        packPhase === 'base' &&
        !baseOnlyPack &&
        baseText.trim() &&
        filteredEarlyBaseOnly.baseComment.trim()
      ) {
        let tid0: string | null = null;
        if (supabase && songId) {
          const dbWrite = createAdminClient() ?? supabase;
          try {
            const { error: delErr } = await dbWrite
              .from('song_tidbits')
              .delete()
              .eq('video_id', videoId)
              .in('source', [...COMMENT_PACK_SOURCES]);
            if (delErr) {
              console.warn('[api/ai/comment-pack] delete old song_tidbits (phase base)', delErr.message);
            }
          } catch (e) {
            console.warn('[api/ai/comment-pack] delete old song_tidbits (phase base)', e);
          }
          try {
            const row = await insertTidbit(dbWrite, {
              songId,
              videoId,
              body: baseText.trim(),
              source: 'ai_commentary',
            });
            tid0 = row?.id ?? null;
          } catch (e) {
            console.error('[api/ai/comment-pack] phase base insertTidbit', e);
          }
        }
        return NextResponse.json({
          songId,
          videoId,
          baseComment: filteredEarlyBaseOnly.baseComment,
          freeComments: filteredEarlyBaseOnly.freeComments,
          source: 'new',
          packPhase: 'base',
          ...(tid0 ? { tidbitIds: [tid0] } : {}),
          ...music8ModeratorHintsPayload,
        });
      }
    }

    // 2. 自由コメント3本（基本情報のあと。1本目＝栄誉・チャート／スーパーグループ時はメンバー紹介、2＝歌詞、3＝サウンド）
    const topics = isSupergroupArtist
      ? ([
          'スーパーグループの**主要メンバー紹介**（**氏名**を通称またはフルネームで**複数**必ず出し、それぞれに**世に知られる元所属バンド名・ソロ名・役割**を本文中で対応づける。結成経緯が分かれば1文に収めてよい。**チャート・売上・受賞・「大ヒット」「バズ」「反響」はこのスロットでも後続でも主題にしない**。不確実な人名・関係性は断定しない）',
          '歌詞テーマやメッセージ（共演・フィーチャリングでは**客演側のパートが担う役割**（例：ラップ対メインヴォーカル）を必ず含め、双方の対比を1〜2文で。パートの長い列挙は禁止）',
          'サウンドの特徴（メロディ・リズム・アレンジの**うち1点**に絞って具体化。共演がある場合は**声質やパートの違いがサウンドに与える効果**を一言入れてよい。「耳に残るフック」など抽象語の積み重ねだけは禁止）',
        ] as const)
      : ([
          '商業的成功と社会的な話題性（このスロット専用。**必ず**次のいずれかを含めること：①主要チャートでの**定性的**な成功（西暦の年を明記。**1位・9位・33位など順位の数字は書かない**。例：1983年頃に全英シングルチャートで大きなヒット、翌年には米ビルボードでもチャート入り）②グラミー等の主要ノミネート・受賞（分かる場合のみ。**Rap/Sung Collaboration 等、共演枠の賞がある場合はその性質に触れてよい**）③複数国で広く再生・話題となったことなど、年とともに触れられる事実。④**タイトル等からリミックス版と分かる曲**では、オリジナルよりこのミックスの方が後からヒット・定着した、といった文脈を**定性・年**で触れてよい（断定できないときは弱い表現）。**禁止**：○位・最高○位・第○位・「〜週1位」など順位や週数の具体数字、作詞者の私人話、伝聞だけの表現、歌詞の読み下し。マイナー曲はライブ定番やカバーの多さにとどめる）',
          '歌詞テーマやメッセージ（共演・フィーチャリングでは**客演側のパートが担う役割**（例：ラップ対メインヴォーカル）を必ず含め、双方の対比を1〜2文で。パートの長い列挙は禁止）',
          'サウンドの特徴（メロディ・リズム・アレンジの**うち1点**に絞って具体化。共演がある場合は**声質やパートの違いがサウンドに与える効果**を一言入れてよい。「耳に残るフック」など抽象語の積み重ねだけは禁止）',
        ] as const);
    if (topics.length !== COMMENT_PACK_MAX_FREE_COMMENTS) {
      console.warn(
        '[comment-pack] topics length must match COMMENT_PACK_MAX_FREE_COMMENTS',
        topics.length,
      );
    }

    const freeSlotIndexParsed = packPhase === 'frees' ? parseOptionalFreeSlotIndex(body) : null;
    const freeSlotIndexOnly =
      freeSlotIndexParsed !== null && slots[freeSlotIndexParsed + 1] ? freeSlotIndexParsed : null;
    const freeComments: string[] = ['', '', ''];

    if (!baseOnlyPack) {
      const banBlockStandard = `・禁止事項（断定・根拠薄い内容の回避）:
  - チャート順位/ビルボード等の順位・スコア、受賞/グラミー等は書かない（1本目の自由コメントで既に扱います。ここでは触れない）
  - 「インスピレーションを得て書かれたと言われています」など、裏付けのない私人話・伝聞調は禁止
  - 「数日で」「異例の速さ」など制作期間の断定をしない
  - 「全ての工程を手掛けた」「ミックスまで」など録音工程の断定をしない
  - 「唯一無二」「世界観を築き上げた」など過剰な断定表現をしない
  - 特定のボーカル名／メンバー名を「この動画で歌っている」と断定しない（タイトルや説明文に明記がある場合のみ）
  - 亡くなった可能性があるメンバーに触れる場合は、現在の歌唱者と誤解される断定表現を避け、無理に名前を出さない`;

      const banBlockStandardSupergroup = `・禁止事項（断定・根拠薄い内容の回避）:
  - チャート順位/ビルボード等、受賞/グラミー、売上、「大ヒット」「バズ」「反響」など**商業・話題性を主題にすること**は書かない（スーパーグループ選曲では自由コメント**いずれも**これらを扱いません）
  - 「インスピレーションを得て書かれたと言われています」など、裏付けのない私人話・伝聞調は禁止
  - 「数日で」「異例の速さ」など制作期間の断定をしない
  - 「全ての工程を手掛けた」「ミックスまで」など録音工程の断定をしない
  - 「唯一無二」「世界観を築き上げた」など過剰な断定表現をしない
  - 特定のボーカル名／メンバー名を「この動画で歌っている」と断定しない（タイトルや説明文に明記がある場合のみ）
  - 亡くなった可能性があるメンバーに触れる場合は、現在の歌唱者と誤解される断定表現を避け、無理に名前を出さない`;

      const banBlockSupergroupMemberIntro = `・この1本だけの必須・禁止:
  - **必須**：**主要メンバーの氏名**を通称またはフルネームで**複数**本文に含め、それぞれに**世に知られる元所属バンド名・ソロ名・役割**のいずれかを対応づけること（誰がどの名義で知られるかが伝わるように）
  - **優先**：チャート・売上・受賞・「大ヒット」「バズ」「反響」より、**メンバー紹介**を本文の主役にすること
  - **禁止**：チャート順位・週数、グラミー等の受賞・ノミネート、社会的反響を**主題**にすること
  - 「インスピレーションを得て…」等の裏付けのない私人話・伝聞調は禁止
  - 制作期間・録音工程の断定、「唯一無二」等の過剰表現は禁止
  - 特定のボーカルがこの動画で歌っている等、メタに無い断定は禁止
  - 亡くなった可能性があるメンバーは誤解を招く表現を避け、無理に名前を出さない`;

      const banBlockHonors = `・この1本だけの必須・禁止:
  - **必須**：チャート的な成功・主要賞・または複数国でのヒットなど、西暦付きで触れられる事実を**少なくとも1つ**書く（私人のインスピレーション談や歌詞の細読だけで終えない）
  - **重要：このAPIはチャート順位のデータベースを参照していません。1位・2位・9位・33位・「最高○位」「第○位」「〜週連続1位」など、順位や週数の具体数字は一切書かないこと**（モデルが毎回違う数字を出してしまい利用者を混乱させるため）。チャートに触れるなら「全英シングルで大ヒット」「1984年頃に米ビルボードでもチャート入り」「トップ10圏での健闘」など**定性的な表現**に限る
  - 全英と全米は別市場であることは踏まえ、**両方に触れる場合も順位の数字は使わず**、年＋国またはチャート種＋定性（大ヒット・ヒット曲・長くチャートに滞留など）で書く
  - グラミー等の受賞・ノミネートは**正式名称が分かる場合のみ**（不確かなら書かない）
  - マイナー曲・インディーで明確な大ヒットでないと判断したら、チャート/グラミーに触れず「ライブ定番」「カバーが多い」などにとどめる
  - 制作期間の断定（「数日で」等）、録音工程の断定、TikTokバズや若者文化の誇張はしない
  - 「恋人からインスピレーションを得た」等の私人話・作詞秘話に逃げない（その内容は2本目以降でも推測口調は禁止）`;

      const buildFreePrompt = (
        i: number,
        usedSection: string,
        extraRoleLeadingLines: string,
      ): string => {
        const topic = topics[i];
        const isHonorsTopic = i === 0 && !isSupergroupArtist;
        const isSupergroupMemberTopic = i === 0 && isSupergroupArtist;
        return `以下の曲について、すでに「基本情報」と他の自由コメントが存在します。

${metaLockBlock}
${collaborationBlock}
${sessionPromptBlock}
【すでに出ているコメント（重複禁止）】
${usedSection || 'まだありません'}

あなたの役割:
${extraRoleLeadingLines}・今回は「${topic}」の観点【だけ】から、この曲について新しい情報を1つ紹介してください。
・基本情報で既に述べたリリース年・アルバム名・テーマの概要を繰り返さないこと。
・他の自由コメントと同じ趣旨の繰り返しも避けること。
${
          i === 1
            ? `

・【歌詞枠の重複防止（必須）】基本情報ですでに触れた「曲の主題・時代背景の一行要約」（例：反戦・特定の紛争への怒り）は繰り返さないこと。
・事件・地名・年号の説明や「なぜ書かれたか」のストーリーは基本情報に任せ、この枠では**表現面に限定**すること（比喩・反復フレーズ・語り口・感情の起伏など）。`
            : ''
        }

${isHonorsTopic ? banBlockHonors : isSupergroupMemberTopic ? banBlockSupergroupMemberIntro : isSupergroupArtist ? banBlockStandardSupergroup : banBlockStandard}

出力ルール:
・日本語、です・ます調。
・2〜4文、60〜140文字程度。
・前置きは短く。「豆知識ですが」は使わない。
・この1本だけを出力してください。説明や箇条書きは禁止。
・英語の思考過程・メタメモは禁止（チャット掲載用の本文のみ）。
・「One detail:」「*Final Version*」「*Final Polish*」「Final Draft:」など英語の見出し・自己チェック用の文は禁止（日本語の本文だけを出力）。`;
      };

      const freeIndices: number[] =
        packPhase === 'frees' && freeSlotIndexOnly !== null
          ? [freeSlotIndexOnly]
          : ([0, 1, 2] as const).filter((ix) => slots[ix + 1]);
      const filteredFreeIndices = freeIndices.filter(
        (ix) => ix >= 0 && ix < COMMENT_PACK_MAX_FREE_COMMENTS && slots[ix + 1],
      );

      /** 遅いモデル対策: 3枠まとめは Promise.all。クライアントが freeSlotIndex で分割したときは1枠＋別HTTP並列 */
      const parallelRoleLinesMulti =
        '・同じHTTPリクエスト内で、**ほか2つの自由コメント枠**も**並列**に生成しています（各枠の観点は異なります）。**この枠の観点だけ**に絞り、基本情報の焼き直しにしないこと。栄誉・歌詞・サウンドで**役割が分かれている**前提として、他枠と主旨が被る本文にしないでください。\n';
      const parallelRoleLinesSingle =
        '・このリクエストでは**このスロットのみ**を生成しています。他の自由枠は**別のHTTPリクエストで並列**に生成されるため、他枠の本文は参照できません。基本情報の焼き直しにしないこと。基本情報と主旨が被らないよう、この枠の観点だけに従ってください。\n';
      const parallelRoleLines =
        filteredFreeIndices.length < COMMENT_PACK_MAX_FREE_COMMENTS
          ? parallelRoleLinesSingle
          : parallelRoleLinesMulti;
      const usedParallel =
        typeof baseText === 'string' && baseText.trim().length > 0 ? baseText.trim() : 'まだありません';

      const draftTexts: string[] = ['', '', ''];
      if (filteredFreeIndices.length > 0) {
        await Promise.all(
          filteredFreeIndices.map(async (i) => {
            try {
              const p0 = buildFreePrompt(i, usedParallel, parallelRoleLines);
              const res = await model.generateContent(p0);
              logGeminiUsage(`comment_pack_free_${i + 1}`, res.response);
              await persistGeminiUsageLog(`comment_pack_free_${i + 1}`, res.response.usageMetadata, {
                videoId,
              });
              draftTexts[i] = extractTextFromGenerateContentResponse(res.response, commentPackModelId);
            } catch (e) {
              console.error('[api/ai/comment-pack] parallel free slot', i + 1, e);
              draftTexts[i] = '';
            }
          }),
        );
      }

      const existingFreeBodies = (): string[] =>
        freeComments.map((s) => (typeof s === 'string' ? s.trim() : '')).filter((s) => s.length > 0);

      for (const i of filteredFreeIndices) {
        const isHonorsTopic = i === 0 && !isSupergroupArtist;
        const isSupergroupMemberTopic = i === 0 && isSupergroupArtist;
        const parallelTxt = (draftTexts[i] ?? '').trim();

        const policyHonorsParallel = isHonorsTopic;
        const okParallel =
          parallelTxt.length > 0 &&
          !containsUnreliableCommentPackClaim(parallelTxt, policyHonorsParallel) &&
          !isSimilarToExistingComment(parallelTxt, [baseText, ...existingFreeBodies()]);

        if (okParallel) {
          freeComments[i] = parallelTxt;
          continue;
        }

        const used = [baseText, ...existingFreeBodies()].filter(Boolean).join('\n---\n');
        const maxAttempts = 3;
        try {
          let attempt = 0;
          let prompt = buildFreePrompt(i, used || 'まだありません', '');
          while (attempt < maxAttempts) {
            attempt += 1;
            const res = await model.generateContent(prompt);
            logGeminiUsage(`comment_pack_free_${i + 1}`, res.response);
            await persistGeminiUsageLog(`comment_pack_free_${i + 1}`, res.response.usageMetadata, {
              videoId,
            });
            const txt = extractTextFromGenerateContentResponse(res.response, commentPackModelId);
            /** 3回目は栄誉枠でもチャート数字を避けるフォールバック → 歌詞・サウンド枠と同じ厳しさで通す */
            const policyHonors = isHonorsTopic && attempt < maxAttempts;
            const tooSimilar = isSimilarToExistingComment(txt, [baseText, ...existingFreeBodies()]);
            if (txt && !containsUnreliableCommentPackClaim(txt, policyHonors) && !tooSimilar) {
              freeComments[i] = txt;
              break;
            }
            if (attempt >= maxAttempts) {
              if (!txt || containsUnreliableCommentPackClaim(txt, policyHonors) || tooSimilar) {
                console.warn(
                  '[comment-pack] free comment slot',
                  i + 1,
                  'failed after',
                  maxAttempts,
                  'attempts. videoId=',
                  videoId,
                );
              }
              break;
            }
            if (attempt === 1) {
              prompt = isHonorsTopic
                ? prompt +
                  '\n（追加指示）チャートは**順位の数字を出さず**（9位・33位・1位など禁止）、西暦＋国またはチャート種＋大ヒット・チャート入りなど定性的に。グラミーは正式名が確かなときだけ。英国と米国の両方に触れる場合も数字順位は使わない。'
                : isSupergroupMemberTopic
                  ? prompt +
                    '\n（追加指示）**主要メンバー氏名を複数**と元所属を本文の中心に置き、チャート・ヒット規模・反響・受賞には触れずに書き直してください。前の文と同じ内容・言い換えのみは避けてください。'
                  : prompt +
                    '\n（追加指示）チャート/受賞/制作期間/録音工程に触れず、指定観点だけで短く書き直してください。すでに出した文と同じ内容・同じ言い換えは避けてください。';
            } else if (attempt === 2) {
              prompt = isHonorsTopic
                ? prompt +
                  '\n（3回目・最終）ビルボード・グラミー・順位・週数・「〜週連続」は書かないこと。リリース年以降に**広く聴かれ、当時のポップ・シーンで話題となった**など、穏やかな位置づけを1〜2文・60〜100字で。誇張・バズ表現は禁止。前に出た文の焼き直しは不可。'
                : isSupergroupMemberTopic
                  ? prompt +
                    '\n（3回目・最終）**メンバー氏名＋元所属**だけに絞り、60〜120字。チャート・反響・受賞は禁止。前の文の焼き直しは不可。'
                  : prompt +
                    '\n（3回目・最終）指定観点だけ、60〜100字。チャート/受賞/制作断定は避け、穏やかな表現に。前に出た文の焼き直しは不可。';
            }
          }
        } catch (e) {
          console.error('[api/ai/comment-pack] generate free comment', i, e);
        }
      }
    }

    const freeCommentsCapped = freeComments.slice(0, COMMENT_PACK_MAX_FREE_COMMENTS);
    /** スロット 0〜2 と DB の ai_chat_1〜3 を対応させる（空枠は '' のまま） */
    const freeBodiesTrimmedTriple = freeCommentsCapped.map((t) =>
      typeof t === 'string' ? t.trim() : '',
    );

    // song_tidbits に保存（新曲は基本のみ、通常は基本＋自由3本）
    const tidbitIds: (string | null)[] = [];
    if (supabase && songId) {
      const dbWrite = createAdminClient() ?? supabase;
      const baseTrim = baseText.trim();

      if (packPhase === 'frees') {
        const { data: baseRow, error: bfErr } = await dbWrite
          .from('song_tidbits')
          .select('id, body')
          .eq('video_id', videoId)
          .eq('source', 'ai_commentary')
          .eq('is_active', true)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (bfErr) {
          console.warn('[api/ai/comment-pack] frees phase base lookup', bfErr.message);
        }
        let storedBody = typeof baseRow?.body === 'string' ? baseRow.body.trim() : '';
        let baseRowId = typeof baseRow?.id === 'string' ? baseRow.id : null;
        if (!baseRowId || storedBody !== baseTrim) {
          if (songId && baseTrim) {
            try {
              const { error: dRepair } = await dbWrite
                .from('song_tidbits')
                .delete()
                .eq('video_id', videoId)
                .eq('source', 'ai_commentary');
              if (dRepair) {
                console.warn(
                  '[api/ai/comment-pack] frees repair delete ai_commentary',
                  dRepair.message,
                );
              }
            } catch (e) {
              console.warn('[api/ai/comment-pack] frees repair delete ai_commentary', e);
            }
            const rowNew = await insertTidbit(dbWrite, {
              songId,
              videoId,
              body: baseTrim,
              source: 'ai_commentary',
            });
            baseRowId = rowNew?.id ?? null;
            storedBody = baseTrim;
          }
          if (!baseRowId) {
            console.warn(
              '[api/ai/comment-pack] frees phase: ai_commentary と baseComment が一致せず、DB 修復もできませんでした（自由コメントは JSON のみ返却）',
            );
          }
        }
        if (baseRowId) {
          if (baseOnlyPack) {
            const mergedIdsBaseOnly = await fetchCommentPackChatTidbitIds(dbWrite, videoId, baseRowId);
            tidbitIds.push(...mergedIdsBaseOnly);
          } else {
          const freeSources = ['ai_chat_1', 'ai_chat_2', 'ai_chat_3'] as const;
          if (freeSlotIndexOnly !== null) {
            const k = freeSlotIndexOnly;
            const bod = freeBodiesTrimmedTriple[k] ?? '';
            if (bod) {
              try {
                const { error: d0 } = await dbWrite
                  .from('song_tidbits')
                  .delete()
                  .eq('video_id', videoId)
                  .eq('source', freeSources[k]);
                if (d0) console.warn('[api/ai/comment-pack] delete chat slot', freeSources[k], d0.message);
              } catch (e) {
                console.warn('[api/ai/comment-pack] delete chat slot', freeSources[k], e);
              }
              try {
                const row = await insertTidbit(dbWrite, {
                  songId,
                  videoId,
                  body: bod,
                  source: freeSources[k],
                });
                if (!row?.id) console.warn('[api/ai/comment-pack] insertTidbit frees single slot', k);
              } catch (e) {
                console.error('[api/ai/comment-pack] insertTidbit frees single slot', k, e);
              }
            }
          } else {
            for (const src of freeSources) {
              try {
                const { error: d0 } = await dbWrite
                  .from('song_tidbits')
                  .delete()
                  .eq('video_id', videoId)
                  .eq('source', src);
                if (d0) console.warn('[api/ai/comment-pack] delete chat slot', src, d0.message);
              } catch (e) {
                console.warn('[api/ai/comment-pack] delete chat slot', src, e);
              }
            }
            for (let k = 0; k < COMMENT_PACK_MAX_FREE_COMMENTS; k++) {
              const bod = freeBodiesTrimmedTriple[k] ?? '';
              if (!bod) continue;
              try {
                const row = await insertTidbit(dbWrite, {
                  songId,
                  videoId,
                  body: bod,
                  source: freeSources[k],
                });
                if (!row?.id) console.warn('[api/ai/comment-pack] insertTidbit frees phase', k);
              } catch (e) {
                console.error('[api/ai/comment-pack] insertTidbit frees phase', k, e);
              }
            }
          }
          const mergedIds = await fetchCommentPackChatTidbitIds(dbWrite, videoId, baseRowId);
          tidbitIds.push(...mergedIds);
          }
        }
      } else {
        // 同一動画で再生成（COMMENT_PACK_SKIP_CACHE 等）するとき、古い ai_commentary / ai_chat_* と UNIQUE がぶつかり
        // ai_chat_1 だけ insert 失敗 → 2本目に tidbitId が付かない、となる。先に該当行を消してから入れ直す。
        try {
          const { error: delErr } = await dbWrite
            .from('song_tidbits')
            .delete()
            .eq('video_id', videoId)
            .in('source', [...COMMENT_PACK_SOURCES]);
          if (delErr) {
            console.warn('[api/ai/comment-pack] delete old song_tidbits', delErr.message);
          }
        } catch (e) {
          console.warn('[api/ai/comment-pack] delete old song_tidbits', e);
        }

        const freeSourcesFull = ['ai_chat_1', 'ai_chat_2', 'ai_chat_3'] as const;
        try {
          const rowBase = await insertTidbit(dbWrite, {
            songId,
            videoId,
            body: baseTrim,
            source: 'ai_commentary',
          });
          tidbitIds.push(rowBase?.id ?? null);
        } catch (e) {
          console.error('[api/ai/comment-pack] insertTidbit base', e);
          tidbitIds.push(null);
        }
        if (!baseOnlyPack) {
          for (let k = 0; k < COMMENT_PACK_MAX_FREE_COMMENTS; k++) {
            const bod = freeBodiesTrimmedTriple[k] ?? '';
            if (!bod) {
              tidbitIds.push(null);
              continue;
            }
            try {
              const row = await insertTidbit(dbWrite, {
                songId,
                videoId,
                body: bod,
                source: freeSourcesFull[k],
              });
              tidbitIds.push(row?.id ?? null);
            } catch (e) {
              console.error('[api/ai/comment-pack] insertTidbit free', k, e);
              tidbitIds.push(null);
            }
          }
        }
      }
    }

    const freeCommentTidbitIds =
      !baseOnlyPack && tidbitIds.length > 1 ? tidbitIds.slice(1) : [];

    const filteredOut = applySlotsToPackBodies(baseText, freeBodiesTrimmedTriple, slots);

    return NextResponse.json({
      songId,
      videoId,
      baseComment: filteredOut.baseComment,
      freeComments: filteredOut.freeComments,
      ...(packPhase === 'frees' ? { packPhase: 'frees' } : {}),
      ...(isNewRelease ? { newReleaseOnly: true } : {}),
      ...(tidbitIds.length > 0 ? { tidbitIds } : {}),
      ...(freeCommentTidbitIds.length > 0 ? { freeCommentTidbitIds } : {}),
      ...music8ModeratorHintsPayload,
    });
  } catch (e) {
    console.error('[api/ai/comment-pack]', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

