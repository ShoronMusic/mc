type KnownCoverOriginal = {
  normalizedTitle: string;
  originalArtistPattern: RegExp;
  originalHint: string;
};

const KNOWN_COVER_ORIGINALS: KnownCoverOriginal[] = [
  {
    normalizedTitle: 'last christmas',
    originalArtistPattern: /\bwham!?\b/i,
    originalHint:
      '『Last Christmas』はWham!が1984年に発表した楽曲として広く知られています。',
  },
];

function normalizeKnownCoverTitle(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[’‘]/g, "'")
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .replace(/\s*\[[^\]]*\]\s*/g, ' ')
    .replace(/["'`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function buildKnownCoverOriginalHint(args: {
  songTitle?: string | null;
  artistName?: string | null;
}): string {
  const normalizedTitle = normalizeKnownCoverTitle(args.songTitle ?? '');
  if (!normalizedTitle) return '';
  const artistName = (args.artistName ?? '').trim();
  const known = KNOWN_COVER_ORIGINALS.find((x) => x.normalizedTitle === normalizedTitle);
  if (!known) return '';
  if (artistName && known.originalArtistPattern.test(artistName)) return '';
  return `${known.originalHint} 現在のアーティストが原曲アーティストと異なる場合は、カバー版として扱い、原曲アーティストに短く触れてください。Music8等に「オリジナル録音」とある場合でも、原曲の存在を打ち消す意味にはしないでください。`;
}

export function factsBlockHasCoverOriginalSignal(factsBlock?: string | null): boolean {
  const t = (factsBlock ?? '').trim();
  if (!t) return false;
  return /録音種別:\s*カバー/i.test(t);
}
