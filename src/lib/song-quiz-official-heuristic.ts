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

/** タイトルに「(Official Music Video)」等の公式 MV／音源表記があるか（大文字小文字無視） */
function hasOfficialStyleVideoTitle(videoTitle: string): boolean {
  const t = videoTitle.toLowerCase();
  return (
    t.includes('(official music video)') ||
    t.includes('(official video)') ||
    t.includes('(official audio)') ||
    t.includes('(official lyric video)') ||
    t.includes('(official 4k)') ||
    t.includes('(official hd)')
  );
}

/** 「Artist - Title …」形式の先頭アーティスト部分（先頭の ` - ` の左） */
export function parseLeadArtistFromYoutubeTitle(videoTitle: string): string | null {
  const t = videoTitle.trim();
  const idx = t.indexOf(' - ');
  if (idx <= 0) return null;
  const lead = t.slice(0, idx).trim();
  return lead.length > 0 ? lead : null;
}

function normalizeArtistLabelForMatch(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/^the\s+/i, '');
}

/** チャンネル名（または oEmbed 投稿者名）がタイトル先頭のアーティストと実質一致するか */
function channelArtistMatchesVideoLead(channelLabel: string, leadArtist: string): boolean {
  const a = normalizeArtistLabelForMatch(channelLabel);
  const b = normalizeArtistLabelForMatch(leadArtist);
  if (!a || !b) return false;
  if (a === b) return true;
  /**
   * 公式チャンネルが略称（Prince）で、タイトル先頭がフル名（Prince and the Revolution）のケース。
   * 厳密一致のみだと `uncertain` → クイズ API が quiz を返さない。
   */
  if (b.length > a.length + 3 && (b.startsWith(`${a} and `) || b.startsWith(`${a} & `))) {
    return true;
  }
  if (a.length > b.length + 3 && (a.startsWith(`${b} and `) || a.startsWith(`${b} & `))) {
    return true;
  }
  return false;
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

  /** Prince 公式チャンネル等: タイトルに公式 MV 表記があり、投稿者名が「Artist - …」の先頭アーティストと一致 */
  if (vt && hasOfficialStyleVideoTitle(vt) && channelLabel) {
    const lead = parseLeadArtistFromYoutubeTitle(vt);
    if (lead && channelArtistMatchesVideoLead(channelLabel, lead)) {
      return { tier: 'allow', signals: ['allow:official_mv_title_artist_channel_match'] };
    }
  }

  /**
   * アップローダー名がアーティストと違う再投稿（例: The Codfather + 「Prince - Purple Rain (Official Video)」）でも、
   * タイトルが公式表記＋「Artist - Title」形式ならクイズ可。従来はここで uncertain となり quiz が null だった。
   * 厳格モード（チャンネル一致など強い信号のみ）: `SONG_QUIZ_STRICT_OFFICIAL_ONLY=1`
   */
  if (process.env.SONG_QUIZ_STRICT_OFFICIAL_ONLY !== '1' && vt && hasOfficialStyleVideoTitle(vt)) {
    const lead = parseLeadArtistFromYoutubeTitle(vt);
    if (lead && lead.length >= 2) {
      return { tier: 'allow', signals: ['allow:official_style_title_lead_relax'] };
    }
  }

  return { tier: 'uncertain', signals: ['uncertain:no_strong_official_signal'] };
}
