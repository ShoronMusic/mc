/**
 * 既存曲へ別 PV を追記するときの同一曲判定。
 * 選曲時の自動マージはせず、管理画面の確認付き追記で使う。
 */
import { compactMatchKey } from '@/lib/song-registration-normalize';

export const MAX_SONG_VIDEO_VARIANTS = 5;

export type AlternatePvMatchLevel = 'high' | 'medium' | 'low' | 'reject';

export type AlternatePvMatchInput = {
  existingArtist: string;
  existingTitle: string;
  incomingArtist?: string | null;
  incomingTitle?: string | null;
  incomingYoutubeTitle?: string | null;
  incomingDescription?: string | null;
  incomingChannelId?: string | null;
  existingChannelIds?: string[];
};

export type AlternatePvMatchResult = {
  level: AlternatePvMatchLevel;
  reasons: string[];
  compactExistingTitle: string;
  compactIncomingTitle: string;
  compactExistingArtist: string;
  compactIncomingArtist: string;
};

const COVER_DENY =
  /\b(cover|covers|reaction|reacts?|karaoke|bootleg|歌ってみた|弾いてみた|fan\s*edit)\b/i;

export function inferSongVideoVariantFromTitle(title: string | null | undefined): string | null {
  const t = (title ?? '').toLowerCase();
  if (!t) return null;
  // Official Visualizer は visualizer（official より先）
  if (/\bvisualizer\b/.test(t)) return 'visualizer';
  if (/\blive\b|live at|live from|concert|acoustic session/.test(t)) return 'live';
  if (/\blyric\b|lyrics\b/.test(t)) return 'lyric';
  if (/\bofficial\b|official music video|official video|\bmv\b/.test(t)) return 'official';
  if (/\btopic\b/.test(t)) return 'topic';
  return null;
}

/** 既存 PV の variant が空／雑な既定のとき、YouTube タイトル推定で上書きしてよいか */
export function shouldBackfillSongVideoVariant(
  currentVariant: string | null | undefined,
  inferredFromYoutubeTitle: string | null | undefined,
): boolean {
  const inferred = (inferredFromYoutubeTitle ?? '').trim().toLowerCase();
  if (!inferred) return false;
  const cur = (currentVariant ?? '').trim().toLowerCase();
  if (!cur || cur === 'other') return true;
  if (cur === inferred) return false;
  // 1曲登録の既定 official のまま Visualizer 等が入っているケース
  if (cur === 'official' && inferred !== 'official') return true;
  return false;
}

export function extractHashtagCompactKeys(description: string | null | undefined): string[] {
  const raw = description ?? '';
  const out: string[] = [];
  const seen = new Set<string>();
  for (const m of raw.matchAll(/#([A-Za-z0-9_]+)/g)) {
    const key = compactMatchKey(m[1] ?? '');
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

function titleLooksLikeCover(youtubeTitle: string | null | undefined): boolean {
  return COVER_DENY.test(youtubeTitle ?? '');
}

function compactTitleRelated(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length < 6 || b.length < 6) return false;
  return a.includes(b) || b.includes(a);
}

/** 「KAROL G, Bruno Mars」と「Bruno Mars, KAROL G」を同一視 */
export function compactArtistSetKey(artist: string): string {
  return compactArtistTokens(artist).slice().sort().join('|');
}

/** カンマ区切りクレジットを個別トークン化（feat は呼び出し側で除く想定） */
export function compactArtistTokens(artist: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const part of (artist || '').split(',')) {
    const key = compactMatchKey(part.trim());
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

/** メインのみ登録の「KAROL G」と共演付き「KAROL G, Bruno Mars」を同一曲候補にする */
export function artistsOverlapForMatch(a: string, b: string): boolean {
  const ta = compactArtistTokens(a);
  const tb = compactArtistTokens(b);
  if (ta.length === 0 || tb.length === 0) return false;
  const setB = new Set(tb);
  return ta.some((t) => setB.has(t));
}

/**
 * 概要の #Still のような短い／汎用タグは同一曲根拠にしない。
 *（#parad0x1c など十分長い曲名タグは有効）
 */
export function isStrongHashtagMatchKey(compactKey: string): boolean {
  return compactKey.length >= 6;
}

export function matchAlternatePvToExistingSong(input: AlternatePvMatchInput): AlternatePvMatchResult {
  const compactExistingArtist = compactMatchKey(input.existingArtist);
  const compactExistingTitle = compactMatchKey(input.existingTitle);
  const incomingTitleRaw = (input.incomingTitle ?? '').trim() || (input.incomingYoutubeTitle ?? '').trim();
  const compactIncomingArtist = compactMatchKey(input.incomingArtist ?? '');
  const compactIncomingTitle = compactMatchKey(incomingTitleRaw);
  const reasons: string[] = [];

  if (titleLooksLikeCover(input.incomingYoutubeTitle) || titleLooksLikeCover(input.incomingTitle)) {
    return {
      level: 'reject',
      reasons: ['カバー／リアクション等のタイトルのため、同一曲としては扱いません。'],
      compactExistingTitle,
      compactIncomingTitle,
      compactExistingArtist,
      compactIncomingArtist,
    };
  }

  const existingArtistSet = compactArtistSetKey(input.existingArtist);
  const incomingArtistSet = compactArtistSetKey(input.incomingArtist ?? '');
  const artistExact = Boolean(
    (compactExistingArtist && compactIncomingArtist && compactExistingArtist === compactIncomingArtist) ||
      (existingArtistSet && incomingArtistSet && existingArtistSet === incomingArtistSet),
  );
  const artistOverlap =
    !artistExact && artistsOverlapForMatch(input.existingArtist, input.incomingArtist ?? '');
  const artistMatch = artistExact || artistOverlap;
  const titleExact =
    Boolean(compactExistingTitle && compactIncomingTitle && compactExistingTitle === compactIncomingTitle);
  const titleRelated = compactTitleRelated(compactExistingTitle, compactIncomingTitle);
  const hashtags = extractHashtagCompactKeys(input.incomingDescription);
  const hashtagHit = Boolean(
    compactExistingTitle &&
      isStrongHashtagMatchKey(compactExistingTitle) &&
      hashtags.includes(compactExistingTitle),
  );
  const existingChannels = (input.existingChannelIds ?? []).map((id) => id.trim()).filter(Boolean);
  const incomingChannel = (input.incomingChannelId ?? '').trim();
  const channelMatch = Boolean(incomingChannel && existingChannels.includes(incomingChannel));

  if (artistExact) reasons.push('アーティスト名が一致（記号・空白を除く）');
  else if (artistOverlap) reasons.push('メイン／共演アーティストが重複（記号・空白を除く）');
  if (titleExact) reasons.push('曲名が一致（記号・空白を除く）');
  else if (titleRelated) reasons.push('曲名が部分一致（記号・空白を除く）');
  if (hashtagHit) reasons.push('概要欄のハッシュタグが既存曲名と一致');
  if (channelMatch) reasons.push('既存PVと同じ YouTube チャンネル');

  let level: AlternatePvMatchLevel = 'low';
  if (!artistMatch && !titleExact && !hashtagHit) {
    level = 'low';
    if (reasons.length === 0) reasons.push('アーティスト・曲名の一致が弱いです。別曲の可能性があります。');
  } else if (artistMatch && titleExact) {
    level = 'high';
  } else if (artistMatch && (titleRelated || hashtagHit || channelMatch)) {
    level = 'medium';
  } else if (titleExact && channelMatch) {
    level = 'medium';
  } else if (artistMatch) {
    level = 'low';
    if (reasons.filter((r) => r.includes('アーティスト')).length === reasons.length) {
      reasons.push('曲名が違うため、別曲の可能性があります。');
    }
  }

  return {
    level,
    reasons,
    compactExistingTitle,
    compactIncomingTitle,
    compactExistingArtist,
    compactIncomingArtist,
  };
}

export function canAddSongVideoVariant(opts: {
  currentCount: number;
  alreadyOnThisSong: boolean;
}): { ok: boolean; error?: string } {
  if (opts.alreadyOnThisSong) return { ok: true };
  if (opts.currentCount >= MAX_SONG_VIDEO_VARIANTS) {
    return {
      ok: false,
      error: `この曲の PV は最大 ${MAX_SONG_VIDEO_VARIANTS} 本です。`,
    };
  }
  return { ok: true };
}
