/**
 * 曲解説: Music8 / 事実ブロックに「確証あるリリース年」または
 * 「収録・シングル等の出自」のどちらも見当たらないときだけ、
 * AI による憶測コメントを避け、曲紹介のみにする。
 */

import type { MusicaichatSongJson } from '@/lib/music8-musicaichat';
import { extractMusic8SongFields } from '@/lib/music8-song-fields';

const YEAR_IN_TEXT_RE = /\b(19[5-9]\d|20[0-3]\d)\b|\b(19[5-9]\d|20[0-3]\d)年/;

function musicaichatSongHasStructuredReleaseYear(song: MusicaichatSongJson | unknown | null): boolean {
  if (!song) return false;
  const rd = (extractMusic8SongFields(song).releaseDate ?? '').trim();
  return /^\d{4}/.test(rd);
}

function factsTextHasConcreteYear(text: string): boolean {
  return YEAR_IN_TEXT_RE.test((text ?? '').trim());
}

/**
 * 事実テキストに、アルバム・収録、または「年＋発売／シングル」などリリースの出自が書かれているか。
 */
function factsTextHasAlbumOrSingleReleaseContext(text: string): boolean {
  const t = (text ?? '').trim();
  if (!t) return false;
  if (/(アルバム|収録|に収録|収録作|収録曲)/.test(t)) return true;
  if (/『[^』]{2,55}』/.test(t) && /(アルバム|収録|シングル|カット|リリース)/.test(t)) return true;
  if (/\d{4}年.{0,40}(シングル|シングルカット|カット|発売|発表)/.test(t)) return true;
  if (/(シングル|シングルカット).{0,35}\d{4}/.test(t)) return true;
  if (/(シングル|シングルカット|A面|B面).{0,25}『/.test(t)) return true;
  return false;
}

/**
 * 事実テキストに盤・シングル文脈があるかを出自情報として扱う。
 */
function hasTrustedReleaseProvenance(
  _song: MusicaichatSongJson | unknown | null,
  combinedFactsText: string,
): boolean {
  // リリース年月が取れていても、収録作/シングルの文脈が不明なケースは「出自不明」とみなす。
  return factsTextHasAlbumOrSingleReleaseContext(combinedFactsText);
}

/**
 * 確証あるリリース年と、収録／シングル等の出自の両方が欠ける場合に true（曲紹介のみへ）。
 */
export function shouldUseSongIntroOnlyDiscographyMode(params: {
  music8Song: MusicaichatSongJson | unknown | null;
  /** Music8 事実ブロック・MusicBrainz 事実などを連結したテキスト */
  combinedFactsText: string;
}): boolean {
  const combined = (params.combinedFactsText ?? '').trim();
  const hasAnyReference = params.music8Song != null || combined.length > 0;
  if (!hasAnyReference) {
    // 参照データがゼロのときは intro-only に固定せず通常解説へ。
    return false;
  }
  const hasYear =
    musicaichatSongHasStructuredReleaseYear(params.music8Song) || factsTextHasConcreteYear(combined);
  const hasProvenance = hasTrustedReleaseProvenance(params.music8Song, combined);
  // 緩和: 年か出自のどちらか一方でも取れるなら通常解説に戻す。
  return !(hasYear || hasProvenance);
}

/** 曲解説・comment-pack 基本枠用の定型文（憶測なし・80字以上を目安） */
export function buildSongIntroOnlyBaseComment(artistLabel: string, songLabel: string): string {
  const a = (artistLabel ?? '').trim() || 'このアーティスト';
  const s = (songLabel ?? '').trim() || 'この曲';
  const body = `${a}の『${s}』です。参照データに確証あるリリース年と収録作品（アルバム・シングル等）の両方が揃っていないため、曲解説は曲名のご紹介にとどめます。`;
  if (body.length >= 80) return body;
  return `${body} 音源をお楽しみください。`;
}

function normalizeReleaseYm(value: string): string {
  const t = (value ?? '').trim();
  if (!t) return '';
  const y = /^(\d{4})/.exec(t)?.[1] ?? '';
  if (y) return `${y}年頃`;
  return '';
}

export function buildSongIntroOnlyArtistFocusComment(params: {
  artistLabel: string;
  songLabel: string;
  music8Song: MusicaichatSongJson | unknown | null;
}): string {
  const a = (params.artistLabel ?? '').trim() || 'このアーティスト';
  const s = (params.songLabel ?? '').trim() || 'この曲';
  const fields = params.music8Song ? extractMusic8SongFields(params.music8Song) : null;
  const releaseYm = normalizeReleaseYm(fields?.releaseDate ?? '');

  if (releaseYm) {
    return `${a}の『${s}』です。詳しいリリース時期や収録アルバムは不明です。この時期の${a}は${releaseYm}、代表作を重ねながら表現の幅を広げ、精力的に活動していた時期として語られます。`;
  }
  return `${a}の『${s}』です。詳しいリリース時期や収録アルバムは不明です。この時期の${a}は音楽性や活動の流れを中心に、アーティスト概要として楽しむのがおすすめです。`;
}
