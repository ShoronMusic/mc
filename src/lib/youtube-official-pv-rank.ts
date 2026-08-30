/**
 * AI エージェント選曲向け: YouTube 検索ヒットから公式 PV を優先し、
 * 邦楽扱い・日本レーベルの編集／メドレー／作業用 BGM を落とす。
 */

export type OfficialPvRankHit = {
  title: string;
  channelTitle: string;
};

const JP_SCRIPT_RE = /[\u3040-\u30FF\u4E00-\u9FFF]/g;

const COMPILATION_TITLE_RE =
  /メドレー|ベストヒット|名曲メドレー|作業用|BGM集|\bBGM\b|\bassorted\b|compilation|\bmix\b|playlist|洋楽\s*no\.?|泣いてしまう|聴いたら|フルで聴ける|#\w+|ワーナーミュージック|sony\s*music\s*japan|ユニバーサルミュージック|エイベックス|著作権.?フリー|royalty\s*free|no\s*copyright|nc\s*music|壮大なBGM|シネマティック|epic\s*music|あなたを映画の主人公/i;

const JP_LABEL_CHANNEL_RE =
  /ワーナーミュージック|warner\s*music\s*japan|ソニーミュージック|sony\s*music\s*japan|ユニバーサル\s*ミュージック|avex|エイベックス|ビクターエンタ|tower\s*records\s*japan/i;

const UNUSABLE_AGENT_QUERY_RE =
  /BGM|作業用|メドレー|royalty\s*free|no\s*copyright|壮大な|シネマティック|epic\s*music|著作権|\bcovers?\b|カバー|歌ってみた/i;

const COVER_OR_KARAOKE_RE =
  /\(\s*covers?\s*\)|\[\s*covers?\s*\]|【\s*covers?\s*】|\bcovers?\s*version\b|\bcovers?\b|カバー(?:曲|版|ver(?:sion)?)?|歌ってみた|弾いてみた|\bkaraoke\b|\breaction\b|\btribute\s*to\b/i;

export function countJapaneseScriptChars(text: string): number {
  return (text.match(JP_SCRIPT_RE) ?? []).length;
}

/** Gemini の検索クエリ／表示名が作業用BGM・編集動画向きなら捨てる */
export function looksLikeUnusableAgentSongQuery(text: string): boolean {
  const t = (text ?? '').trim();
  if (!t) return false;
  if (UNUSABLE_AGENT_QUERY_RE.test(t)) return true;
  if (countJapaneseScriptChars(t) >= 3) return true;
  return false;
}

/** 日本語タイトル／日本レーベル編集で、部屋では邦楽扱いになりやすいアップロード */
export function looksLikeJapaneseMarketUpload(title: string, channelTitle: string): boolean {
  const t = (title ?? '').trim();
  const ch = (channelTitle ?? '').trim();
  if (countJapaneseScriptChars(`${t}\n${ch}`) >= 3) return true;
  if (JP_LABEL_CHANNEL_RE.test(`${t} ${ch}`)) return true;
  if (/邦楽|歌ってみた|弾いてみた|歌詞付き/.test(`${t} ${ch}`)) return true;
  return false;
}

export function looksLikeCompilationOrMixTitle(title: string, channelTitle: string): boolean {
  const blob = `${title ?? ''} ${channelTitle ?? ''}`;
  if (COMPILATION_TITLE_RE.test(blob)) return true;
  if ((title.match(/#/g) ?? []).length >= 2) return true;
  return false;
}

/** タイトルやチャンネルがカバー／歌ってみた／カラオケと明示している */
export function looksLikeCoverOrKaraokeUpload(title: string, channelTitle: string): boolean {
  return COVER_OR_KARAOKE_RE.test(`${title ?? ''} ${channelTitle ?? ''}`);
}

/** VEVO / Topic / Official チャンネル／タイトルの公式信号 */
export function hasOfficialPvPositiveSignal(hit: OfficialPvRankHit): boolean {
  const title = (hit.title ?? '').trim();
  const ch = (hit.channelTitle ?? '').trim();
  if (looksLikeCoverOrKaraokeUpload(title, ch)) return false;
  if (/vevo$/i.test(ch) || /\bvevo\b/i.test(ch)) return true;
  if (/\s-\s*topic$/i.test(ch)) return true;
  if (/official$/i.test(ch)) return true;
  if (/\(official\s+(?:4k\s+|hd\s+)?(?:music\s+)?video\)/i.test(title)) return true;
  if (/\(official\s+audio\)/i.test(title) || /\(official\s+lyric\s*video\)/i.test(title)) return true;
  if (/\[official\s+(?:music\s+)?video\]/i.test(title)) return true;
  return false;
}

/**
 * 高いほど公式 PV らしい。0 未満はエージェント選曲では採用しない。
 */
export function scoreYoutubeHitForOfficialPv(hit: OfficialPvRankHit): number {
  const title = (hit.title ?? '').trim();
  const ch = (hit.channelTitle ?? '').trim();
  if (looksLikeCoverOrKaraokeUpload(title, ch)) return -1000;
  let score = 0;

  if (/vevo$/i.test(ch) || /\bvevo\b/i.test(ch)) score += 100;
  if (/\s-\s*topic$/i.test(ch)) score += 80;
  if (/official$/i.test(ch)) score += 70;
  if (/\(official\s+(?:4k\s+|hd\s+)?(?:music\s+)?video\)/i.test(title)) score += 50;
  if (/\(official\s+audio\)/i.test(title) || /\(official\s+lyric\s*video\)/i.test(title)) score += 40;
  if (/\s-\s/.test(title)) score += 10;

  if (looksLikeCompilationOrMixTitle(title, ch)) score -= 200;
  if (looksLikeJapaneseMarketUpload(title, ch)) score -= 200;

  return score;
}

export function pickBestOfficialPvSearchHit<T extends OfficialPvRankHit>(hits: readonly T[]): T | null {
  let best: T | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const hit of hits) {
    if (looksLikeCoverOrKaraokeUpload(hit.title, hit.channelTitle)) continue;
    if (!hasOfficialPvPositiveSignal(hit)) continue;
    const s = scoreYoutubeHitForOfficialPv(hit);
    if (s < 0) continue;
    if (s > bestScore) {
      bestScore = s;
      best = hit;
    }
  }
  return best;
}
