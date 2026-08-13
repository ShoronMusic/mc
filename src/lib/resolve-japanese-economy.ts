import {
  metadataIndicatesJapaneseDomestic,
  shouldUseJapaneseEconomyCommentPack,
} from '@/lib/comment-pack-jp-economy';
import {
  ensureDomesticJpArtistCache,
  looksLikeOfficialArtistChannel,
  matchesDomesticJpArtist,
  stripYoutubeOfficialChannelSuffix,
} from '@/lib/domestic-jp-artists';
import { isJapaneseArtistByMusicBrainzLookup } from '@/lib/musicbrainz-artist-area';
import {
  ensureWesternTreatedJpArtistCache,
  matchesWesternTreatedJpArtist,
} from '@/lib/western-treated-jp-artists';

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
  const latinArtist = /[A-Za-z]/.test(artistLike);
  const latinTitle = /[A-Za-z]/.test(titleLike);
  return latinArtist && latinTitle;
}

function artistNameForMusicBrainzLookup(opts: JapaneseEconomyMetadataInput): string {
  const candidates = [
    opts.artist,
    opts.artistDisplay,
    stripYoutubeOfficialChannelSuffix(opts.channelTitle),
  ];
  for (const c of candidates) {
    const t = (c ?? '').trim();
    if (t.length >= 2 && t.length <= 200) return t;
  }
  return '';
}

/**
 * 邦楽として扱うか（catalog_scope・邦楽 DB 登録・視聴履歴等）。
 * COMMENT_PACK_JP_ECONOMY には依存しない。
 */
export async function resolveJapaneseDomesticWithMusicBrainz(
  opts: JapaneseEconomyMetadataInput,
): Promise<boolean> {
  await ensureWesternTreatedJpArtistCache();
  await ensureDomesticJpArtistCache();

  if (matchesWesternTreatedJpArtist(opts.artist, opts.artistDisplay)) return false;
  if (
    matchesDomesticJpArtist(
      opts.artist,
      opts.artistDisplay,
      opts.channelTitle,
      opts.title,
    )
  ) {
    return true;
  }
  if (metadataIndicatesJapaneseDomestic(opts)) return true;

  if (process.env.MUSICBRAINZ_LOOKUP === '0') return false;

  const forMb = artistNameForMusicBrainzLookup(opts);
  if (!forMb) return false;

  const skipMb =
    isClearlyNonJapaneseMetadata(opts) &&
    !matchesDomesticJpArtist(forMb) &&
    !looksLikeOfficialArtistChannel(opts.channelTitle);
  if (skipMb) return false;

  return isJapaneseArtistByMusicBrainzLookup(forMb);
}

/**
 * comment-pack の邦楽節約と同条件（COMMENT_PACK_JP_ECONOMY=0 のときは常に false）。
 * 同一選曲で domestic を既に取っているときは {@link japaneseEconomyFromDomestic} を使い、MB 二重呼び出しを避ける。
 */
export async function resolveJapaneseEconomyWithMusicBrainz(
  opts: JapaneseEconomyMetadataInput,
): Promise<boolean> {
  if (process.env.COMMENT_PACK_JP_ECONOMY === '0') return false;
  return resolveJapaneseDomesticWithMusicBrainz(opts);
}

/** domestic 判定結果から economy フラグを派生（追加の MusicBrainz 呼び出しなし） */
export function japaneseEconomyFromDomestic(isDomestic: boolean): boolean {
  if (process.env.COMMENT_PACK_JP_ECONOMY === '0') return false;
  return isDomestic;
}
