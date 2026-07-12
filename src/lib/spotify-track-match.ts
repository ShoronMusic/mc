/**
 * 選曲時 Spotify トラック候補の採用／要確認判定
 */
import { compactMatchKey } from '@/lib/song-registration-normalize';

export type SpotifyMatchDecision =
  | { action: 'apply'; score: number }
  | { action: 'review'; reason: string; score: number }
  | { action: 'skip'; reason: string };

export type SpotifyTrackCandidate = {
  spotifyTrackId: string;
  spotifyName: string | null;
  spotifyArtists: string | null;
  artistRefs: { id: string; name: string }[];
  popularity: number | null;
};

/** 邦楽の name_en / spotify_artist_id など、main_artist 表記ゆれ用 */
export type SpotifyArtistMatchOptions = {
  alternateArtistNames?: string[];
  expectedSpotifyArtistIds?: string[];
  /**
   * 日本語曲名↔Spotify英題の緩和に使う名前（m8 slug 由来のみ推奨）。
   * 汚染された name_en をここに入れないこと。
   */
  crossScriptArtistNames?: string[];
};

const REJECT_ARTIST = /\b(tribute|tribute\s+co\.?|hit\s+co\.?|karaoke|cover\s+band|backing\s+business|party\s+tyme|zzang\s+karaoke)\b/i;
const REJECT_TITLE =
  /\b(karaoke\s+version|originally\s+performed|made\s+popular\s+by|tribute\s+to|cover\s+version)\b/i;

const JP_SCRIPT = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/;
/** Spotify の「 - ANIME edit」「 - Remastered」など右側バージョン表記 */
const VERSION_OR_GLOSS_RIGHT =
  /\b(anime\s*edit|remix|live|acoustic|instrumental|radio\s*edit|edit|ver\.?|version|mv|short|demo)\b/i;

export function isSpotifyRejectListed(artistNames: string[], trackName: string | null): string | null {
  const artistBlob = artistNames.join(' ');
  if (REJECT_ARTIST.test(artistBlob)) return 'reject_artist_pattern';
  if (REJECT_TITLE.test(trackName ?? '')) return 'reject_title_pattern';
  return null;
}

function titleTokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/（[^）]*）/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

/** 空白・記号を除き、ラテン／日本語を残す（compactMatchKey は日本語が消える） */
export function titleMatchKey(s: string): string {
  return s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\([^)]*\)/g, '')
    .replace(/（[^）]*）/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

/**
 * Spotify によくある「主タイトル - 英訳/バージョン」の主タイトル側。
 */
export function spotifyTitlePrimarySegment(s: string): string {
  const t = s.trim();
  const m = t.match(/^(.+?)\s*[-–—－ｰ〜~]\s*(.+)$/);
  if (!m?.[1]?.trim()) return t;
  const left = m[1].trim();
  const right = m[2].trim();
  if (!left) return t;

  // 日本語主タイトル + 英訳
  if (JP_SCRIPT.test(left)) return left;

  // ラテン主タイトル + ANIME edit / Remastered 等
  if (VERSION_OR_GLOSS_RIGHT.test(right)) return left;

  // 右が短い英単語のみ（英訳・副題）で左が十分長い
  if (
    left.length >= 3 &&
    right.length <= 24 &&
    /^[A-Za-z0-9][A-Za-z0-9\s.'-]*$/.test(right) &&
    !VERSION_OR_GLOSS_RIGHT.test(left)
  ) {
    return left;
  }

  return t;
}

export function titleSimilarity(expectedSongTitle: string, actual: string | null): number {
  if (!actual?.trim()) return 0;
  const exp = titleMatchKey(expectedSongTitle);
  if (!exp) return 0;

  const actFull = titleMatchKey(actual);
  const actPrimary = titleMatchKey(spotifyTitlePrimarySegment(actual));

  if (exp === actFull || exp === actPrimary) return 1;
  if (
    (actFull && (actFull.includes(exp) || exp.includes(actFull))) ||
    (actPrimary && (actPrimary.includes(exp) || exp.includes(actPrimary)))
  ) {
    return 0.85;
  }

  // 従来のラテン向けキー（後方互換）
  const a = compactMatchKey(expectedSongTitle);
  const bLat = compactMatchKey(actual);
  const bPrimary = compactMatchKey(spotifyTitlePrimarySegment(actual));
  if (a) {
    if (bLat && (a === bLat || bLat.includes(a) || a.includes(bLat))) {
      return a === bLat ? 1 : 0.85;
    }
    if (bPrimary && (a === bPrimary || bPrimary.includes(a) || a.includes(bPrimary))) {
      return a === bPrimary ? 1 : 0.85;
    }
  }

  const expTok = new Set(titleTokens(expectedSongTitle));
  const actTok = new Set(titleTokens(spotifyTitlePrimarySegment(actual)));
  if (expTok.size === 0 || actTok.size === 0) return 0;
  let inter = 0;
  for (const tok of expTok) if (actTok.has(tok)) inter++;
  return inter / Math.max(expTok.size, actTok.size);
}

function artistFirstCreditMatches(expectedDisplayArtist: string, firstCredit: string | null): boolean {
  if (!firstCredit?.trim()) return false;
  const expPrimary = expectedDisplayArtist.split(',')[0]?.trim() ?? expectedDisplayArtist;
  const expKey = compactMatchKey(expPrimary);
  const creditKey = compactMatchKey(firstCredit);
  // 日本語のみの名前は compactMatchKey が空 → 誤一致させない
  if (!expKey || !creditKey) return false;
  return expKey === creditKey;
}

/** 空白・ハイフン差を吸収したラテン表記のゆるい一致（sakanaction ↔ Sakanaction） */
function latinArtistKeysLooselyEqual(a: string, b: string): boolean {
  const ka = compactMatchKey(a);
  const kb = compactMatchKey(b);
  if (!ka || !kb) return false;
  return ka === kb || ka.includes(kb) || kb.includes(ka);
}

function artistCreditMatchesExpected(
  expectedDisplayArtist: string,
  firstCredit: string,
  firstCreditSpotifyId: string | null,
  options?: SpotifyArtistMatchOptions,
): boolean {
  const names = [
    expectedDisplayArtist,
    ...(options?.alternateArtistNames ?? []),
  ]
    .map((n) => n.trim())
    .filter(Boolean);

  for (const name of names) {
    if (artistFirstCreditMatches(name, firstCredit)) return true;
    // name_en 同士の空白差など
    if (
      titleMatchKey(name.split(',')[0]?.trim() ?? name) === titleMatchKey(firstCredit) &&
      titleMatchKey(firstCredit).length > 0
    ) {
      return true;
    }
    // slug 由来エイリアス（sakanaction）↔ Spotify 英語名（Sakanaction）
    if (latinArtistKeysLooselyEqual(name.split(',')[0]?.trim() ?? name, firstCredit)) {
      return true;
    }
  }

  const ids = (options?.expectedSpotifyArtistIds ?? [])
    .map((id) => id.trim())
    .filter(Boolean);
  if (firstCreditSpotifyId && ids.includes(firstCreditSpotifyId)) return true;

  return false;
}

function artistIdMatched(
  firstCreditSpotifyId: string | null,
  options?: SpotifyArtistMatchOptions,
): boolean {
  if (!firstCreditSpotifyId) return false;
  return (options?.expectedSpotifyArtistIds ?? []).some(
    (id) => id.trim() === firstCreditSpotifyId,
  );
}

function hasStrongArtistAlias(
  firstArtist: string,
  firstArtistId: string | null,
  options?: SpotifyArtistMatchOptions,
): boolean {
  if (artistIdMatched(firstArtistId, options)) return true;
  const names = [
    ...(options?.crossScriptArtistNames ?? []),
    ...(options?.alternateArtistNames ?? []),
  ];
  for (const name of names) {
    const n = name.trim();
    if (!n) continue;
    if (latinArtistKeysLooselyEqual(n, firstArtist)) return true;
    if (
      titleMatchKey(n) === titleMatchKey(firstArtist) &&
      titleMatchKey(firstArtist).length > 0
    ) {
      return true;
    }
  }
  return false;
}

/** slug 由来など、英題↔日本語の緩和に使ってよいアーティスト一致か */
function hasCrossScriptArtistTrust(
  firstArtist: string,
  firstArtistId: string | null,
  options?: SpotifyArtistMatchOptions,
): boolean {
  if (artistIdMatched(firstArtistId, options)) return true;
  const names = options?.crossScriptArtistNames ?? [];
  for (const name of names) {
    const n = name.trim();
    if (!n) continue;
    if (latinArtistKeysLooselyEqual(n, firstArtist)) return true;
    if (
      titleMatchKey(n) === titleMatchKey(firstArtist) &&
      titleMatchKey(firstArtist).length > 0
    ) {
      return true;
    }
  }
  return false;
}

/** 日本語曲名 ↔ Spotify 英題（怪獣 / Kaiju）など文字種が違うか */
export function isCrossScriptSongTitle(expected: string, actual: string | null | undefined): boolean {
  const a = (expected ?? '').trim();
  const b = (actual ?? '').trim();
  if (!a || !b) return false;
  const aCjk = JP_SCRIPT.test(a);
  const bCjk = JP_SCRIPT.test(b);
  return aCjk !== bCjk;
}

export function scoreSpotifyTrackCandidate(
  candidate: SpotifyTrackCandidate,
  expectedDisplayArtist: string,
  expectedSongTitle: string,
  options?: SpotifyArtistMatchOptions,
): SpotifyMatchDecision {
  const firstArtist = candidate.artistRefs[0]?.name ?? candidate.spotifyArtists?.split(',')[0]?.trim() ?? '';
  const firstArtistId = candidate.artistRefs[0]?.id?.trim() || null;
  const artistNames = candidate.artistRefs.map((a) => a.name).filter(Boolean);
  const reject = isSpotifyRejectListed(artistNames, candidate.spotifyName);
  if (reject) {
    return { action: 'review', reason: reject, score: 0 };
  }

  if (!artistCreditMatchesExpected(expectedDisplayArtist, firstArtist, firstArtistId, options)) {
    return { action: 'review', reason: 'artist_mismatch', score: 0.1 };
  }

  let titleSim = titleSimilarity(expectedSongTitle, candidate.spotifyName);
  const strongAlias = hasStrongArtistAlias(firstArtist, firstArtistId, options);
  const crossScriptTrusted = hasCrossScriptArtistTrust(firstArtist, firstArtistId, options);

  // 邦楽: DB「怪獣」vs Spotify「Kaiju」など。slug / spotify_artist_id で確からしいときだけ緩和
  if (
    titleSim < 0.55 &&
    crossScriptTrusted &&
    isCrossScriptSongTitle(expectedSongTitle, candidate.spotifyName)
  ) {
    titleSim = 0.72;
  }

  if (titleSim < 0.55) {
    return { action: 'review', reason: 'title_weak_match', score: titleSim };
  }

  let score = titleSim * 70;
  if (titleSim >= 0.95) score += 20;
  if (candidate.popularity != null && candidate.popularity >= 20) score += 10;

  const knownArtist = artistIdMatched(firstArtistId, options);

  // artists.spotify_artist_id / slug エイリアス一致時はタイトル閾値を緩和
  if ((knownArtist || strongAlias) && titleSim >= 0.7) {
    return { action: 'apply', score: Math.max(score, 80) };
  }

  if (score >= 75 && titleSim >= 0.7) {
    return { action: 'apply', score };
  }
  return { action: 'review', reason: 'low_confidence', score };
}

export function pickBestSpotifyCandidate(
  candidates: SpotifyTrackCandidate[],
  expectedDisplayArtist: string,
  expectedSongTitle: string,
  options?: SpotifyArtistMatchOptions,
): { best: SpotifyTrackCandidate | null; decision: SpotifyMatchDecision } {
  let bestCandidate: SpotifyTrackCandidate | null = null;
  let bestDecision: SpotifyMatchDecision = { action: 'skip', reason: 'no_candidates' };
  let bestScore = -1;

  for (const c of candidates) {
    const d = scoreSpotifyTrackCandidate(c, expectedDisplayArtist, expectedSongTitle, options);
    if (d.action === 'apply') {
      if (!bestCandidate || bestDecision.action !== 'apply' || d.score > bestScore) {
        bestCandidate = c;
        bestDecision = d;
        bestScore = d.score;
      }
    } else if (d.action === 'review' && bestDecision.action !== 'apply') {
      if (!bestCandidate || d.score > bestScore) {
        bestCandidate = c;
        bestDecision = d;
        bestScore = d.score;
      }
    }
  }

  if (bestDecision.action === 'apply') {
    return { best: bestCandidate, decision: bestDecision };
  }
  if (bestCandidate && bestDecision.action === 'review') {
    return { best: bestCandidate, decision: bestDecision };
  }
  return { best: null, decision: { action: 'skip', reason: 'no_match' } };
}
