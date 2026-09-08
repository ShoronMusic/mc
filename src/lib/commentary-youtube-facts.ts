import { parseCollabArtistNamesFromMainArtist } from '@/lib/library-search-query';

const DJ_CENTERED_STYLE_RE =
  /electronica|electronic|dance|house|techno|trance|edm|synthwave|d\s*&\s*b|drum\s*and\s*bass/i;

/** Electronica / Dance など、メインが DJ・プロデューサー寄りの分類か */
export function isDjCenteredCatalogStyle(style: string | null | undefined): boolean {
  return DJ_CENTERED_STYLE_RE.test((style ?? '').trim());
}

/** クレジット表記にメイン以外の固有名（feat. / カンマ共演）があるか */
export function artistCreditHasNamedFeatured(artistDisplay: string | null | undefined): boolean {
  const s = (artistDisplay ?? '').trim();
  if (!s) return false;
  if (/\b(?:feat\.?|ft\.?|featuring)\b/i.test(s)) return true;
  if (parseCollabArtistNamesFromMainArtist(s).length >= 2) return true;
  const byX = s
    .split(/\s+x\s+|\s+×\s+/i)
    .map((p) => p.trim())
    .filter(Boolean);
  return byX.length >= 2;
}

/**
 * 本文で「男性ボーカル／女性ボーカル」と書いてよいのは、
 * Electronica 等でメイン以外のフィーチャー名がクレジットに無いときだけ。
 */
export function shouldMentionVocalGenderInProse(opts: {
  style?: string | null;
  artistDisplay?: string | null;
  hasNamedFeaturedArtist?: boolean;
}): boolean {
  if (!isDjCenteredCatalogStyle(opts.style)) return false;
  if (typeof opts.hasNamedFeaturedArtist === 'boolean') return !opts.hasNamedFeaturedArtist;
  return !artistCreditHasNamedFeatured(opts.artistDisplay);
}

export const COMMENTARY_BALLAD_PROSE_RULE = `【バラード】
・スローな情感曲・パワーバラード・ラブバラードなど、バラードと分かる場合はハードロック／ポップ等の分類に関わらず、本文に「バラード」と一言入れる。分からないときは無理に書かない。`;

export const COMMENTARY_VOCAL_GENDER_PROSE_RULE = `【ボーカルの呼び方】
・名前が分かる（または広く知られたフロントマン名がある）ときはその名前を使う。
・名前が分からないバンド／ソロ歌手では「男性ボーカル」「女性ボーカル」と書かず、「ボーカル」だけにする（カタログの F/M を本文に展開しない）。
・例外: Electronica / Dance などメインが DJ・プロデューサーで、クレジットにメイン以外のフィーチャー名が無いときだけ、「女性ボーカル」「男性ボーカル」と書いてよい。`;

export const COMMENTARY_ARTIST_KNOWLEDGE_RULES = `【アーティスト知識（Music8/MB が空でも可）】
・当該アーティストが、国籍・バンド/ソロ・大枠の音楽性（ハードロック、グラムメタル、スタジアムロック、ソウル等）として広く識別できる場合は書いてよい。知らない場合は書かない。
・広く知られたフロントマン名は、動画タイトルまたは YouTube 概要に出ていれば書いてよい。概要に無くても、そのバンドのボーカリストとして一般に定着している名前なら書いてよい。動画で「いま歌っている」断定は、概要やタイトルに無い限り避ける。
・カタログやサイト分類の「Pop」等は粗いラベルであり、制作ジャンルの断定ではない。ハードロック／メタル系として知られるアーティストに、Pop 合わせのシンセやダンスビートを足さない。
・禁止のまま: チャート順位、未確認アルバム名、制作秘話の捏造。
・どの曲にも使える「親しみやすいメロディ／洗練されたシンセ／タイトでダンサブル／耳に残るフック／サウンドスケープ／現代的なプロダクション」の連打は禁止。この曲・このバンドに固有の楽器・声・編成を1点だけ具体化する。
${COMMENTARY_BALLAD_PROSE_RULE}
${COMMENTARY_VOCAL_GENDER_PROSE_RULE}`;

const YT_FACTS_MAX_CHARS = 900;

function looksLikeSubscribeSpam(line: string): boolean {
  return /subscribe|チャンネル登録|follow us|stream now|link in (bio|description)|#shorts\b/i.test(
    line,
  );
}

/** 概要欄から宣伝・URL・ハッシュタグ連打を除いた短い抜粋 */
export function sanitizeYoutubeDescriptionForCommentary(
  raw: string | null | undefined,
  maxChars: number = YT_FACTS_MAX_CHARS,
): string {
  const text = (raw ?? '').replace(/\r\n/g, '\n').trim();
  if (!text) return '';

  const kept: string[] = [];
  for (const part of text.split('\n')) {
    let line = part.replace(/https?:\/\/\S+/gi, ' ').replace(/\s+/g, ' ').trim();
    if (!line) continue;
    if (looksLikeSubscribeSpam(line)) continue;
    const hashCount = (line.match(/#\w+/g) ?? []).length;
    if (hashCount >= 8 && line.replace(/#\w+/g, '').trim().length < 12) continue;
    line = line.replace(/(?:#\w+\s*){4,}/g, ' ').replace(/\s+/g, ' ').trim();
    if (line) kept.push(line);
    if (kept.join('\n').length >= maxChars) break;
  }

  let out = kept.join('\n').trim();
  if (out.length > maxChars) out = `${out.slice(0, maxChars - 1).trim()}…`;
  return out;
}

export function buildYoutubeMetadataFactsBlock(opts: {
  description?: string | null;
  publishedAt?: string | null;
  channelTitle?: string | null;
}): string {
  const lines: string[] = [];
  const channel = (opts.channelTitle ?? '').trim();
  if (channel) lines.push(`・YouTube チャンネル: ${channel}`);
  const published = (opts.publishedAt ?? '').trim();
  if (published) {
    const d = published.slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) lines.push(`・YouTube 公開日: ${d}`);
  }
  const desc = sanitizeYoutubeDescriptionForCommentary(opts.description);
  if (desc) {
    lines.push('・YouTube 概要（抜粋。テーマ・メンバー名・曲の位置づけに使ってよい。チャートの数字は本文に書かない）:');
    lines.push(desc);
  }
  if (lines.length === 0) return '';
  return `【YouTube メタデータ】\n${lines.join('\n')}`;
}
