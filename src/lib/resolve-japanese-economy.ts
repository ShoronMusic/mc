import { shouldUseJapaneseEconomyCommentPack } from '@/lib/comment-pack-jp-economy';
import { isJapaneseArtistByMusicBrainzLookup } from '@/lib/musicbrainz-artist-area';

export type JapaneseEconomyMetadataInput = Parameters<typeof shouldUseJapaneseEconomyCommentPack>[0];

function hasJapaneseChars(s: string | null | undefined): boolean {
  const t = (s ?? '').trim();
  if (!t) return false;
  return /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\uFF00-\uFFEF]/.test(t);
}

/**
 * 英語メタデータが明確な曲は MB の曖昧一致で邦楽誤判定しやすい。
 * その場合は MB 補助判定をスキップして false を返す。
 */
function isClearlyNonJapaneseMetadata(opts: JapaneseEconomyMetadataInput): boolean {
  const lang = (opts.defaultAudioLanguage ?? '').trim().toLowerCase();
  if (lang.startsWith('ja')) return false;
  const fields = [
    opts.title,
    opts.artistDisplay,
    opts.artist,
    opts.song,
    opts.channelTitle,
    (opts.description ?? '').slice(0, 300),
  ];
  const hasAnyJapanese = fields.some((v) => hasJapaneseChars(v));
  if (hasAnyJapanese) return false;
  const artistLike = (opts.artist ?? opts.artistDisplay ?? '').trim();
  const titleLike = (opts.song ?? opts.title ?? '').trim();
  // 最低限、アーティスト名・曲名が英数字主体で取れている場合は「非邦楽メタ」とみなす
  const latinArtist = /[A-Za-z]/.test(artistLike);
  const latinTitle = /[A-Za-z]/.test(titleLike);
  return latinArtist && latinTitle;
}

/**
 * 邦楽節約と同じ条件で判定（日本語メタ／ja 音声 → 即 true、それ以外は MusicBrainz）。
 * COMMENT_PACK_JP_ECONOMY=0 のときは常に false（MusicBrainz も呼ばない）。
 */
export async function resolveJapaneseEconomyWithMusicBrainz(
  opts: JapaneseEconomyMetadataInput
): Promise<boolean> {
  if (shouldUseJapaneseEconomyCommentPack(opts)) return true;
  if (process.env.COMMENT_PACK_JP_ECONOMY === '0') return false;
  if (isClearlyNonJapaneseMetadata(opts)) return false;
  const forMb = (opts.artist ?? opts.artistDisplay ?? '').trim();
  if (!forMb) return false;
  return isJapaneseArtistByMusicBrainzLookup(forMb);
}
