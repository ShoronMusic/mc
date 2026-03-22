import { shouldUseJapaneseEconomyCommentPack } from '@/lib/comment-pack-jp-economy';
import { isJapaneseArtistByMusicBrainzLookup } from '@/lib/musicbrainz-artist-area';

export type JapaneseEconomyMetadataInput = Parameters<typeof shouldUseJapaneseEconomyCommentPack>[0];

/**
 * 邦楽節約と同じ条件で判定（日本語メタ／ja 音声 → 即 true、それ以外は MusicBrainz）。
 * COMMENT_PACK_JP_ECONOMY=0 のときは常に false（MusicBrainz も呼ばない）。
 */
export async function resolveJapaneseEconomyWithMusicBrainz(
  opts: JapaneseEconomyMetadataInput
): Promise<boolean> {
  if (shouldUseJapaneseEconomyCommentPack(opts)) return true;
  if (process.env.COMMENT_PACK_JP_ECONOMY === '0') return false;
  const forMb = (opts.artist ?? opts.artistDisplay ?? '').trim();
  if (!forMb) return false;
  return isJapaneseArtistByMusicBrainzLookup(forMb);
}
