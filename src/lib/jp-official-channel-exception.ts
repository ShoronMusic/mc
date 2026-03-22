/**
 * 邦楽（日本語メタ／ja 音声／MB 等）でも、指定アーティストの「公式 YouTube チャンネル」上の動画だけ
 * AI 解説・comment-pack・クライアント側の邦楽サイレンスを免除する。
 *
 * チャンネル ID は @ハンドルページの externalId（2025–2026 時点）に基づく。
 * 追加: 環境変数 JP_DOMESTIC_OFFICIAL_CHANNEL_EXCEPTION_IDS にカンマ区切りで UC… を指定。
 */

const CORE_OFFICIAL_CHANNEL_IDS: readonly string[] = [
  'UCzycs8MqvIY4nXWwS-v4J9g', // ONE OK ROCK (@ONEOKROCK)
  'UC12HMtO5MYph9dCZZ7yygng', // XG (@xg_official)
  'UCln9P4Qm3-EAY4aiEPmRwEA', // Ado (@Ado1024)
  'UCp0iCvHGMwyfPHpYq7n2sPw', // ATARASHII GAKKO! (@ATARASHIIGAKKO)
  'UCZW5lIUz93q_aZIkJPAC0IQ', // 88rising（ATARASHII GAKKO! 等の公式配信。例: watch?v=pHMH408ltEM）
  'UCvpredjG93ifbCP1Y77JyFA', // YOASOBI（Ayase / YOASOBI @Ayase_YOASOBI）
];

let cachedMergedSet: Set<string> | null = null;

function mergedOfficialChannelIdSet(): Set<string> {
  if (cachedMergedSet) return cachedMergedSet;
  const s = new Set<string>(CORE_OFFICIAL_CHANNEL_IDS);
  const raw = process.env.JP_DOMESTIC_OFFICIAL_CHANNEL_EXCEPTION_IDS;
  if (typeof raw === 'string' && raw.trim()) {
    for (const part of raw.split(',')) {
      const id = part.trim();
      if (id) s.add(id);
    }
  }
  cachedMergedSet = s;
  return s;
}

/** テスト用: マージ済みセットのキャッシュを消す */
export function resetJpOfficialChannelExceptionCacheForTests(): void {
  cachedMergedSet = null;
}

/**
 * 動画の channelId が、上記いずれかの公式チャンネル（＋ env 追加分）か。
 */
export function isJpDomesticOfficialChannelAiException(channelId: string | null | undefined): boolean {
  if (!channelId || typeof channelId !== 'string') return false;
  const id = channelId.trim();
  if (!/^UC[\w-]{22}$/.test(id)) return false;
  return mergedOfficialChannelIdSet().has(id);
}

/**
 * 選曲紹介の末尾に「（邦楽）」を付けないアーティスト（ONE OK ROCK は洋楽サイト上でも表記しない）
 */
export function suppressJpDomesticAnnounceTagForArtist(opts: {
  artist: string | null | undefined;
  artistDisplay: string | null | undefined;
}): boolean {
  const parts = [opts.artist, opts.artistDisplay]
    .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
    .map((x) => x.trim());
  if (parts.length === 0) return false;
  const lower = parts.join(' ').toLowerCase();
  const compact = lower.replace(/\s+/g, '');
  if (compact.includes('oneokrock')) return true;
  if (parts.some((p) => /ワンオク|ワンオクロック/.test(p))) return true;
  return false;
}
