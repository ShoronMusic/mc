import {
  colorsStudiosTrustsOembedArtistFirst,
  isAppleMusicChannelAuthor,
  isGeniusChannelAuthor,
} from '@/lib/format-song-display';
import { isJpDomesticOfficialChannelAiException } from '@/lib/jp-official-channel-exception';

export type SongQuizOfficialTier = 'allow' | 'uncertain' | 'deny';

export type SongQuizOfficialHeuristicResult = {
  tier: SongQuizOfficialTier;
  /** ログ用の短いラベル（本番レスポンスには載せない想定） */
  signals: string[];
};

/** チャンネル名・動画タイトルに含まれるとクイズ対象外（ファン投稿等） */
const DENY_IN_CHANNEL = /\b(cover|covers|coverband|reaction|reacts?|karaoke|bootleg|歌ってみた|弾いてみた|fan\s*edit|ファン動画|再現|copy|コピー)\b/i;
const DENY_IN_TITLE = /\b(cover|reaction|歌ってみた|弾いてみた|karaoke|bootleg|fan\s*edit)\b/i;

function parseSongQuizOfficialChannelIdsFromEnv(): Set<string> {
  const raw = process.env.SONG_QUIZ_OFFICIAL_CHANNEL_IDS;
  const s = new Set<string>();
  if (typeof raw !== 'string' || !raw.trim()) return s;
  for (const part of raw.split(',')) {
    const id = part.trim();
    if (/^UC[\w-]{22}$/.test(id)) s.add(id);
  }
  return s;
}

let cachedEnvChannelIds: Set<string> | null = null;
function envOfficialChannelIdSet(): Set<string> {
  if (!cachedEnvChannelIds) cachedEnvChannelIds = parseSongQuizOfficialChannelIdsFromEnv();
  return cachedEnvChannelIds;
}

/** テスト用 */
export function resetSongQuizOfficialChannelEnvCacheForTests(): void {
  cachedEnvChannelIds = null;
}

/**
 * 曲解説後クイズ第一段階用: YouTube のチャンネル名・動画タイトル等から「公式っぽさ」をヒューリスティックに分類する。
 * - allow: クイズ出題可（第一段階はこの tier のみ）
 * - uncertain / deny: クイズは出さない
 */
export function evaluateSongQuizOfficialHeuristic(opts: {
  channelId: string | null | undefined;
  channelTitle: string | null | undefined;
  videoTitle: string | null | undefined;
  /** oEmbed の author_name（COLORS／Genius 判定でチャンネル名と併用） */
  channelAuthorName?: string | null | undefined;
}): SongQuizOfficialHeuristicResult {
  const ch = (opts.channelTitle ?? '').trim();
  const vt = (opts.videoTitle ?? '').trim();
  const id = (opts.channelId ?? '').trim();
  const author = (opts.channelAuthorName ?? '').trim();
  const channelLabel = ch || author;

  if (channelLabel && DENY_IN_CHANNEL.test(channelLabel)) {
    return { tier: 'deny', signals: ['deny:channel_keyword'] };
  }
  if (vt && DENY_IN_TITLE.test(vt)) {
    return { tier: 'deny', signals: ['deny:video_title_keyword'] };
  }

  if (isJpDomesticOfficialChannelAiException(id)) {
    return { tier: 'allow', signals: ['allow:jp_official_channel_exception'] };
  }
  if (id && envOfficialChannelIdSet().has(id)) {
    return { tier: 'allow', signals: ['allow:SONG_QUIZ_OFFICIAL_CHANNEL_IDS'] };
  }

  if (/\bvevo\b/i.test(channelLabel) || /vevo$/i.test(channelLabel)) {
    return { tier: 'allow', signals: ['allow:vevo'] };
  }
  if (/\s-\s*topic$/i.test(channelLabel)) {
    return { tier: 'allow', signals: ['allow:youtube_topic'] };
  }
  if (/official$/i.test(channelLabel)) {
    return { tier: 'allow', signals: ['allow:channel_official_suffix'] };
  }

  const geniusOrApple =
    isGeniusChannelAuthor(author || null) ||
    isGeniusChannelAuthor(ch || null) ||
    isAppleMusicChannelAuthor(author || null) ||
    isAppleMusicChannelAuthor(ch || null);
  if (geniusOrApple) {
    return { tier: 'allow', signals: ['allow:genius_or_apple_music_channel'] };
  }

  if (colorsStudiosTrustsOembedArtistFirst(author || null, vt) || colorsStudiosTrustsOembedArtistFirst(ch || null, vt)) {
    return { tier: 'allow', signals: ['allow:colors_show'] };
  }

  return { tier: 'uncertain', signals: ['uncertain:no_strong_official_signal'] };
}
