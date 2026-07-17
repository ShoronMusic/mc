/**
 * 選曲後に `songs` / `song_videos` へ登録してよいか（音楽コンテンツか）を判定する。
 * 映画・ゲーム実況・一般エンタメ等の YouTube URL は曲マスタに載せない。
 *
 * `SONG_DB_REGISTRATION_GATE=0` で無効化（検証用）。
 */

import { resolveFamousPvArtistSongPack } from '@/lib/youtube-famous-pv-override';
import {
  isGarbageArtistSongParse,
  parseArtistTitle,
} from '@/lib/format-song-display';
import { isJpDomesticOfficialChannelAiException } from '@/lib/jp-official-channel-exception';
import {
  canonicalJapaneseArtistFromChannel,
  parseArtistSongFromJpBilingualHyphenTitle,
  parseArtistSongFromJpHyphenTitleSlashEnArtist,
  parseArtistSongFromJpSlashTitle,
} from '@/lib/jp-domestic-youtube-title';
import { evaluateSongQuizOfficialHeuristic } from '@/lib/song-quiz-official-heuristic';

export const YOUTUBE_CATEGORY_MUSIC = 10;
export const YOUTUBE_CATEGORY_FILM_ANIMATION = 1;
export const YOUTUBE_CATEGORY_GAMING = 20;
export const YOUTUBE_CATEGORY_ENTERTAINMENT = 24;

/** カテゴリだけ見れば音楽以外と分かる ID（Music / Entertainment は含めない） */
const NON_MUSIC_YOUTUBE_CATEGORY_IDS = new Set([
  1, // Film & Animation
  2, // Autos & Vehicles
  15, // Pets & Animals
  17, // Sports
  19, // Travel & Events
  20, // Gaming
  25, // News & Politics
  26, // Howto & Style
  27, // Education
  28, // Science & Technology
  29, // Nonprofits & Activism
]);

const NON_MUSIC_TITLE_PATTERNS: RegExp[] = [
  /\bofficial\s+trailer\b/i,
  /\bteaser\s+trailer\b/i,
  /\bfinal\s+trailer\b/i,
  /\b予告(?:編|篇)\b/u,
  /\b本(?:編|篇)(?:完全版)?\b/u,
  /\bfull\s+movie\b/i,
  /\bfull\s+film\b/i,
  /\bcomplete\s+movie\b/i,
  /\b(?:^|\s)映画(?:「|\s|$)/u,
  /\b劇場版\b/u,
  /\banime\s+episode\b/i,
  /\bepisode\s+\d+\b/i,
  /\b第\s*\d+\s*[話集]\b/u,
  /\bgameplay\b/i,
  /\bwalkthrough\b/i,
  /\blet'?s\s+play\b/i,
  /\b実況(?:プレイ)?\b/u,
  /\b攻略(?:動画|チャンネル)?\b/u,
  /\bspeedrun\b/i,
  /\bpodcast\b/i,
  /\bニュース\b/u,
  /\bbreaking\s+news\b/i,
  /\bpress\s+conference\b/i,
  /\b記者会見\b/u,
  /\bvlog\b/i,
  /\b料理(?:動画|レシピ)?\b/u,
  /\brecipe\b/i,
  /\bcooking\s+tutorial\b/i,
  /\bdocumentary\b/i,
  /\bドキュメンタリー\b/u,
  /\bunboxing\b/i,
  /\b開封(?:動画)?\b/u,
  /\bproduct\s+review\b/i,
  /\b商品(?:レビュー|紹介)\b/u,
  /\bASMR\b(?!.*(?:music|song|cover|歌))/i,
  /\bTED\s+Talk\b/i,
  /\blecture\b/i,
  /\b講演(?:会|動画)?\b/u,
  /\bhighlight\s+reel\b/i,
  /\b試合(?:ハイライト|ダイジェスト)\b/u,
  /\bmatch\s+highlights\b/i,
  /\bWWE\b/i,
  /\bUFC\b/i,
  /\bNBA\b/i,
  /\bMLB\b/i,
  /\bNFL\b/i,
  /\bF1\b/i,
  /\bサッカー(?:中継|ハイライト)\b/u,
  /\b(?:TV|テレビ)(?:番組|ドラマ)\b/u,
  /\bvariety\s+show\b/i,
  /\btalk\s+show\b/i,
  /\bバラエティ\b/u,
  /\bお笑い(?:ライブ|ネタ)\b/u,
  /\bstand[\s-]?up\s+comedy\b/i,
  /\bcomedy\s+special\b/i,
];

const MUSIC_TITLE_PATTERNS: RegExp[] = [
  /\bofficial\s+music\s+video\b/i,
  /\bofficial\s+video\b/i,
  /\bofficial\s+audio\b/i,
  /\bofficial\s+lyric\s+video\b/i,
  /\blyric\s+video\b/i,
  /\bmusic\s+video\b/i,
  /\b(?:^|\s)MV(?:\s|$|[\[(])/i,
  /\b(?:^|\s)PV(?:\s|$|[\[(])/i,
  /\b(?:^|\s)M\/V(?:\s|$)/i,
  /\b(?:^|\s)ライブ(?:映像|音源)?(?:\s|$|[\[(])/u,
  /\blive\s+(?:at|from|performance|session|concert)\b/i,
  /\b(?:^|\s)cover(?:\s|$|[\[(])/i,
  /\b(?:^|\s)カバー(?:曲|版)?(?:\s|$)/u,
  /\b(?:^|\s)歌(?:ってみた|詞|詞付き)(?:\s|$|[\[(])/u,
  /\b(?:^|\s)feat\.?\s+/i,
  /\b(?:^|\s)ft\.?\s+/i,
  /\b(?:^|\s)remix(?:\s|$|[\[(])/i,
  /\b(?:^|\s)acoustic(?:\s|$|[\[(])/i,
  /\b(?:^|\s)unplugged(?:\s|$|[\[(])/i,
  /\b(?:^|\s)session(?:\s|$|[\[(])/i,
  /\b(?:^|\s)single(?:\s|$|[\[(])/i,
  /\b(?:^|\s)EP(?:\s|$|[\[(])/i,
  /\b(?:^|\s)album(?:\s|$|[\[(])/i,
  /\b(?:^|\s)single\s+version\b/i,
  /\b(?:^|\s)radio\s+edit\b/i,
  /\b(?:^|\s)sped\s+up\b/i,
  /\b(?:^|\s)slowed\s+(?:\+?\s*reverb)?\b/i,
  /\b(?:^|\s)8D\s+audio\b/i,
  /\b(?:^|\s)visualizer\b/i,
  /\b(?:^|\s)Visualizer\b/,
  /\b(?:^|\s)Topic\b/,
];

const MUSIC_CHANNEL_PATTERNS: RegExp[] = [
  /\bvevo\b/i,
  /\brecords\b/i,
  /\bmusic\b/i,
  /\bofficial\b/i,
  / - topic$/i,
  /topic$/i,
  /\bレコード\b/u,
  /\bミュージック\b/u,
];

export type SongDbRegistrationInput = {
  videoId?: string | null;
  rawTitle?: string | null;
  channelTitle?: string | null;
  channelId?: string | null;
  categoryId?: number | null;
  description?: string | null;
  mainArtist?: string | null;
  songTitle?: string | null;
  /** Music8 曲 JSON が取れた（邦楽はごく一部のみ） */
  hasMusic8Match?: boolean;
  /** 邦楽（日本語メタ／ja 音声／MB 等）— 公式シグナル必須（MV/PV 表記の有無は問わない） */
  isJapaneseDomestic?: boolean;
  /** oEmbed author_name（公式チャンネル判定の補助） */
  channelAuthorName?: string | null;
  viewCount?: number | null;
  /** 管理プレイリスト import 等 */
  forceAllow?: boolean;
};

export type SongDbRegistrationDecision = {
  persist: boolean;
  reason:
    | 'allowed'
    | 'forced'
    | 'music8'
    | 'existing'
    | 'disabled'
    | 'non_music'
    | 'jp_unofficial';
};

function isRegistrationGateEnabled(): boolean {
  return process.env.SONG_DB_REGISTRATION_GATE !== '0';
}

/** 邦楽向け公式必須ルール。`SONG_DB_JP_OFFICIAL_ONLY=0` で無効化。 */
function isJapaneseDomesticOfficialOnlyEnabled(): boolean {
  return process.env.SONG_DB_JP_OFFICIAL_ONLY !== '0';
}

function hasJapaneseOfficialTitleMarker(rawTitle: string): boolean {
  return /\b公式\b/u.test(rawTitle) || /【公式】/u.test(rawTitle);
}

/** `アーティスト / 曲名 -Music Video-` 等をアーティスト公式チャンネルで配信しているパターン */
function looksLikeJpOfficialSlashMvOnArtistChannel(input: SongDbRegistrationInput): boolean {
  const rawTitle = (input.rawTitle ?? '').trim();
  if (!rawTitle) return false;
  const slash = parseArtistSongFromJpSlashTitle(rawTitle);
  if (!slash) return false;
  const channel = (input.channelTitle ?? input.channelAuthorName ?? '').trim();
  if (!channel) return false;
  const canonical = canonicalJapaneseArtistFromChannel(channel, slash.artist);
  if (!canonical) return false;
  const slashArtistNorm = slash.artist.trim();
  if (canonical !== slashArtistNorm && !channel.includes(slashArtistNorm)) return false;
  return (
    /\bMusic\s+Video\b/i.test(rawTitle) ||
    /\bOfficial\s+Video\b/i.test(rawTitle) ||
    /\bMV\b/u.test(rawTitle) ||
    /\bPV\b/u.test(rawTitle) ||
    /\bM\/V\b/u.test(rawTitle)
  );
}

/** `米津玄師 - Flamingo / Kenshi Yonezu` 等をアーティスト公式チャンネルで配信しているパターン */
function looksLikeJpOfficialHyphenSlashEnOnArtistChannel(input: SongDbRegistrationInput): boolean {
  const rawTitle = (input.rawTitle ?? '').trim();
  if (!rawTitle) return false;
  const parsed = parseArtistSongFromJpHyphenTitleSlashEnArtist(rawTitle);
  if (!parsed) return false;
  const channel = (input.channelTitle ?? input.channelAuthorName ?? '').trim();
  if (!channel) return false;
  const canonical = canonicalJapaneseArtistFromChannel(channel, parsed.artist);
  if (!canonical) return false;
  const artistNorm = parsed.artist.trim();
  return canonical === artistNorm || channel.includes(artistNorm);
}

/** `米津玄師 - 烏 Kenshi Yonezu - Karasu` 等をアーティスト公式チャンネルで配信しているパターン */
function looksLikeJpOfficialBilingualHyphenOnArtistChannel(input: SongDbRegistrationInput): boolean {
  const rawTitle = (input.rawTitle ?? '').trim();
  if (!rawTitle) return false;
  const parsed = parseArtistSongFromJpBilingualHyphenTitle(rawTitle);
  if (!parsed) return false;
  const channel = (input.channelTitle ?? input.channelAuthorName ?? '').trim();
  if (!channel) return false;
  const canonical = canonicalJapaneseArtistFromChannel(channel, parsed.artist);
  if (!canonical) return false;
  const artistNorm = parsed.artist.trim();
  return canonical === artistNorm || channel.includes(artistNorm);
}

/**
 * 邦楽: 公式チャンネル／配信元表記／クイズ用公式ヒューリスティック（再生数フォールバック除く）で許可。
 */
export function isOfficialEnoughForJapaneseDomesticSongDb(
  input: SongDbRegistrationInput,
): boolean {
  const rawTitle = (input.rawTitle ?? '').trim();

  if (isJpDomesticOfficialChannelAiException(input.channelId)) return true;
  if (hasMusicDistributionDescription(input.description)) return true;
  if (rawTitle && hasJapaneseOfficialTitleMarker(rawTitle)) return true;
  if (looksLikeJpOfficialSlashMvOnArtistChannel(input)) return true;
  if (looksLikeJpOfficialHyphenSlashEnOnArtistChannel(input)) return true;
  if (looksLikeJpOfficialBilingualHyphenOnArtistChannel(input)) return true;

  const r = evaluateSongQuizOfficialHeuristic({
    channelId: input.channelId,
    channelTitle: input.channelTitle,
    videoTitle: input.rawTitle,
    channelAuthorName: input.channelAuthorName,
    viewCount: input.viewCount,
  });
  if (r.tier !== 'allow') return false;
  if (r.signals.some((s) => s.startsWith('allow:view_count_fallback'))) return false;
  return true;
}

function blobText(input: SongDbRegistrationInput): string {
  return [
    input.rawTitle,
    input.mainArtist,
    input.songTitle,
    input.channelTitle,
    input.description?.slice(0, 600),
  ]
    .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
    .join('\n');
}

function looksLikeStandardDistributedTrackYoutubeTitle(raw: string): boolean {
  const t = raw.trim();
  if (t.length < 8 || !/\s-\s/.test(t)) return false;
  return /\([^)]*\bofficial\b[^)]*\)|\([^)]*lyric\s+video[^)]*\)|\([^)]*\bofficial\s+audio[^)]*\)/i.test(
    t,
  );
}

function hasMusicTitleSignal(rawTitle: string): boolean {
  if (!rawTitle.trim()) return false;
  if (looksLikeStandardDistributedTrackYoutubeTitle(rawTitle)) return true;
  for (const re of MUSIC_TITLE_PATTERNS) {
    if (re.test(rawTitle)) return true;
  }
  return false;
}

function hasNonMusicTitleSignal(text: string): boolean {
  for (const re of NON_MUSIC_TITLE_PATTERNS) {
    if (re.test(text)) return true;
  }
  return false;
}

function hasMusicChannelSignal(channelTitle: string | null | undefined): boolean {
  const ch = (channelTitle ?? '').trim();
  if (!ch) return false;
  for (const re of MUSIC_CHANNEL_PATTERNS) {
    if (re.test(ch)) return true;
  }
  return false;
}

function hasMusicDistributionDescription(description: string | null | undefined): boolean {
  const d = (description ?? '').trim();
  if (!d) return false;
  return /\bprovided to youtube by\b/i.test(d.slice(0, 1200));
}

function hasParseableMusicArtistTitle(input: SongDbRegistrationInput): boolean {
  const rawTitle = (input.rawTitle ?? '').trim();
  if (!rawTitle) return false;
  const parsed =
    parseArtistTitle(rawTitle) ??
    (input.mainArtist?.trim() && input.songTitle?.trim()
      ? { artist: input.mainArtist.trim(), song: input.songTitle.trim() }
      : null);
  if (!parsed) return false;
  if (isGarbageArtistSongParse(parsed)) return false;
  if (hasNonMusicTitleSignal(`${parsed.artist}\n${parsed.song}`)) return false;
  return true;
}

export type RoomAnnounceMusicCheckInput = {
  rawTitle: string;
  authorName?: string | null;
  channelTitle?: string | null;
  categoryId?: number | null;
  description?: string | null;
};

/**
 * 部屋 announce で nonMusic 扱いするか（選曲紹介・AI 解説を止める粗い判定）。
 * 曲 DB 登録ゲートよりやや寛容（MV・コラボ表記は音楽として通す）。
 */
export function isNonMusicYoutubeForRoomAnnounce(input: RoomAnnounceMusicCheckInput): boolean {
  const rawTitle = (input.rawTitle ?? '').trim();
  if (!rawTitle) return false;

  const gateInput = buildSongDbRegistrationInput({
    rawTitle,
    channelTitle: input.channelTitle ?? input.authorName ?? null,
    channelAuthorName: input.authorName ?? null,
    categoryId: input.categoryId ?? null,
    description: input.description ?? null,
  });

  if (gateInput.categoryId === YOUTUBE_CATEGORY_MUSIC) return false;
  if (hasMusicTitleSignal(rawTitle)) return false;
  if (
    hasMusicChannelSignal(input.channelTitle) ||
    hasMusicChannelSignal(input.authorName)
  ) {
    if (hasParseableMusicArtistTitle(gateInput)) return false;
  }
  if (hasMusicDistributionDescription(input.description)) return false;

  const text = blobText(gateInput);
  if (hasNonMusicTitleSignal(text)) return true;

  const lowerTitle = rawTitle.toLowerCase();
  const lowerAuthor = (input.authorName ?? '').toLowerCase();
  const nonMusicKeywords = [
    '切り抜き',
    '切り抜き集',
    '実況',
    '解説',
    'ランキング',
    'top10',
    'top 10',
    'top30',
    'top 30',
    'おすすめアニメ',
    'reaction',
    'リアクション',
    '生配信',
    '雑談',
    'vtuber',
  ];
  if (nonMusicKeywords.some((kw) => lowerTitle.includes(kw) || lowerAuthor.includes(kw))) {
    return true;
  }
  if (/作業用|bgm|睡眠用|relax/i.test(rawTitle)) return true;

  // アニメ本編・各話など（MV コラボの「TVアニメ」表記は hasMusicTitleSignal で除外済み）
  if (
    (lowerTitle.includes('アニメ') || lowerTitle.includes('anime')) &&
    /本編|第\s*\d+\s*[話集]|切り抜き|まとめ|ランキング|episode\s+\d+/i.test(rawTitle)
  ) {
    return true;
  }

  return false;
}

/** 新規 `songs` / `song_videos` 登録可否（既存行の更新判定には使わない）。 */
export function shouldPersistVideoToSongDatabase(
  input: SongDbRegistrationInput,
): SongDbRegistrationDecision {
  if (!isRegistrationGateEnabled()) {
    return { persist: true, reason: 'disabled' };
  }
  if (input.forceAllow) {
    return { persist: true, reason: 'forced' };
  }
  if (resolveFamousPvArtistSongPack(input.videoId)) {
    return { persist: true, reason: 'allowed' };
  }

  if (
    input.isJapaneseDomestic === true &&
    isJapaneseDomesticOfficialOnlyEnabled()
  ) {
    if (isOfficialEnoughForJapaneseDomesticSongDb(input)) {
      return { persist: true, reason: 'allowed' };
    }
    return { persist: false, reason: 'jp_unofficial' };
  }

  if (input.hasMusic8Match) {
    return { persist: true, reason: 'music8' };
  }

  const rawTitle = (input.rawTitle ?? '').trim();
  const text = blobText(input);
  const categoryId =
    typeof input.categoryId === 'number' && Number.isFinite(input.categoryId)
      ? Math.floor(input.categoryId)
      : null;

  if (categoryId === YOUTUBE_CATEGORY_MUSIC) {
    return { persist: true, reason: 'allowed' };
  }

  if (hasMusicTitleSignal(rawTitle)) {
    return { persist: true, reason: 'allowed' };
  }
  if (hasMusicChannelSignal(input.channelTitle)) {
    return { persist: true, reason: 'allowed' };
  }
  if (hasMusicDistributionDescription(input.description)) {
    return { persist: true, reason: 'allowed' };
  }

  if (categoryId != null && NON_MUSIC_YOUTUBE_CATEGORY_IDS.has(categoryId)) {
    return { persist: false, reason: 'non_music' };
  }

  if (hasNonMusicTitleSignal(text)) {
    return { persist: false, reason: 'non_music' };
  }

  if (categoryId === YOUTUBE_CATEGORY_ENTERTAINMENT && !hasParseableMusicArtistTitle(input)) {
    return { persist: false, reason: 'non_music' };
  }

  if (hasParseableMusicArtistTitle(input)) {
    return { persist: true, reason: 'allowed' };
  }

  return { persist: false, reason: 'non_music' };
}

export function buildSongDbRegistrationInput(params: {
  videoId?: string | null;
  rawTitle?: string | null;
  channelTitle?: string | null;
  channelId?: string | null;
  categoryId?: number | null;
  description?: string | null;
  mainArtist?: string | null;
  songTitle?: string | null;
  hasMusic8Match?: boolean;
  isJapaneseDomestic?: boolean;
  channelAuthorName?: string | null;
  viewCount?: number | null;
  forceAllow?: boolean;
}): SongDbRegistrationInput {
  return {
    videoId: params.videoId ?? null,
    rawTitle: params.rawTitle ?? null,
    channelTitle: params.channelTitle ?? null,
    channelId: params.channelId ?? null,
    categoryId: params.categoryId ?? null,
    description: params.description ?? null,
    mainArtist: params.mainArtist ?? null,
    songTitle: params.songTitle ?? null,
    hasMusic8Match: params.hasMusic8Match === true,
    isJapaneseDomestic: params.isJapaneseDomestic === true,
    channelAuthorName: params.channelAuthorName ?? null,
    viewCount:
      typeof params.viewCount === 'number' && Number.isFinite(params.viewCount)
        ? params.viewCount
        : null,
    forceAllow: params.forceAllow === true,
  };
}
