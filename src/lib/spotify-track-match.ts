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

const REJECT_ARTIST = /\b(tribute|tribute\s+co\.?|hit\s+co\.?|karaoke|cover\s+band|backing\s+business|party\s+tyme|zzang\s+karaoke)\b/i;
const REJECT_TITLE =
  /\b(karaoke\s+version|originally\s+performed|made\s+popular\s+by|tribute\s+to|cover\s+version)\b/i;

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
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

function titleSimilarity(expected: string, actual: string | null): number {
  if (!actual?.trim()) return 0;
  const a = compactMatchKey(expected);
  const b = compactMatchKey(actual);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (b.includes(a) || a.includes(b)) return 0.85;

  const expTok = new Set(titleTokens(expected));
  const actTok = new Set(titleTokens(actual));
  if (expTok.size === 0 || actTok.size === 0) return 0;
  let inter = 0;
  for (const t of expTok) if (actTok.has(t)) inter++;
  return inter / Math.max(expTok.size, actTok.size);
}

function artistFirstCreditMatches(expectedDisplayArtist: string, firstCredit: string | null): boolean {
  if (!firstCredit?.trim()) return false;
  const expPrimary = expectedDisplayArtist.split(',')[0]?.trim() ?? expectedDisplayArtist;
  return compactMatchKey(expPrimary) === compactMatchKey(firstCredit);
}

export function scoreSpotifyTrackCandidate(
  candidate: SpotifyTrackCandidate,
  expectedDisplayArtist: string,
  expectedSongTitle: string,
): SpotifyMatchDecision {
  const firstArtist = candidate.artistRefs[0]?.name ?? candidate.spotifyArtists?.split(',')[0]?.trim() ?? '';
  const artistNames = candidate.artistRefs.map((a) => a.name).filter(Boolean);
  const reject = isSpotifyRejectListed(artistNames, candidate.spotifyName);
  if (reject) {
    return { action: 'review', reason: reject, score: 0 };
  }

  if (!artistFirstCreditMatches(expectedDisplayArtist, firstArtist)) {
    return { action: 'review', reason: 'artist_mismatch', score: 0.1 };
  }

  const titleSim = titleSimilarity(expectedSongTitle, candidate.spotifyName);
  if (titleSim < 0.55) {
    return { action: 'review', reason: 'title_weak_match', score: titleSim };
  }

  let score = titleSim * 70;
  if (titleSim >= 0.95) score += 20;
  if (candidate.popularity != null && candidate.popularity >= 20) score += 10;

  if (score >= 75 && titleSim >= 0.7) {
    return { action: 'apply', score };
  }
  return { action: 'review', reason: 'low_confidence', score };
}

export function pickBestSpotifyCandidate(
  candidates: SpotifyTrackCandidate[],
  expectedDisplayArtist: string,
  expectedSongTitle: string,
): { best: SpotifyTrackCandidate | null; decision: SpotifyMatchDecision } {
  let bestCandidate: SpotifyTrackCandidate | null = null;
  let bestDecision: SpotifyMatchDecision = { action: 'skip', reason: 'no_candidates' };

  for (const c of candidates) {
    const d = scoreSpotifyTrackCandidate(c, expectedDisplayArtist, expectedSongTitle);
    if (d.action === 'apply') {
      if (!bestCandidate || d.score > (bestDecision as { score: number }).score) {
        bestCandidate = c;
        bestDecision = d;
      }
    } else if (d.action === 'review' && bestDecision.action !== 'apply') {
      if (!bestCandidate || d.score > bestDecision.score) {
        bestCandidate = c;
        bestDecision = d;
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
