/**
 * 管理ライブラリ：邦楽寄りの `songs` 行を一覧から除外するための判定。
 * YouTube 概要欄・チャンネル名は DB に無いため、`main_artist` / `song_title` / `display_title` のみで見る。
 * `COMMENT_PACK_JP_ECONOMY` には依存しない（ライブラリは常に洋楽寄せ）。
 */

import { textHasJapaneseScript } from '@/lib/comment-pack-jp-economy';

function primaryMetadataLooksWesternLatin(opts: {
  title: string;
  artistDisplay: string | null | undefined;
  artist: string | null | undefined;
  song: string | null | undefined;
}): boolean {
  const artistLike = (opts.artist ?? opts.artistDisplay ?? '').trim();
  const titleLike = (opts.song ?? opts.title ?? '').trim();
  if (artistLike.length < 2 || titleLike.length < 2) return false;
  const latinArtist = /[A-Za-z]/.test(artistLike);
  const latinTitle = /[A-Za-z]/.test(titleLike);
  if (!latinArtist || !latinTitle) return false;
  const primaryBlob = [opts.title, opts.artistDisplay, opts.artist, opts.song]
    .filter((x): x is string => typeof x === 'string' && x.length > 0)
    .join('\n');
  return !textHasJapaneseScript(primaryBlob);
}

/**
 * 管理ライブラリから除外すべき「邦楽寄り」行か。
 * - 主要メタに日本語等があり、かつ「英字主体の洋楽」例外に当てはまらないとき true。
 */
export function songRowLooksJapaneseDomesticForAdminLibrary(row: {
  main_artist: string | null;
  song_title: string | null;
  display_title: string | null;
}): boolean {
  const title =
    (row.display_title ?? '').trim() ||
    `${(row.main_artist ?? '').trim()} - ${(row.song_title ?? '').trim()}`.trim() ||
    '';

  const opts = {
    title,
    artistDisplay: row.main_artist,
    artist: row.main_artist,
    song: row.song_title,
  };

  const primaryBlob = [opts.title, opts.artistDisplay, opts.artist, opts.song]
    .filter((x): x is string => typeof x === 'string' && x.length > 0)
    .join('\n');

  if (!textHasJapaneseScript(primaryBlob)) return false;
  if (primaryMetadataLooksWesternLatin(opts)) return false;
  return true;
}
