/**
 * 曲解説: Music8 / 事実ブロックに「確証あるリリース年」と「収録・シングル等の出自」が揃わないときは、
 * AI による憶測コメントを避け、曲紹介のみにする。
 */

import type { MusicaichatSongJson } from '@/lib/music8-musicaichat';
import { extractMusic8SongFields } from '@/lib/music8-song-fields';

const YEAR_IN_TEXT_RE = /\b(19[5-9]\d|20[0-3]\d)\b|\b(19[5-9]\d|20[0-3]\d)年/;

function musicaichatSongHasStructuredReleaseYear(song: MusicaichatSongJson | null): boolean {
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
 * Music8 曲 JSON の releases に日付がある、または事実テキストに盤・シングル文脈がある＝出自が参照データで示せる。
 */
function hasTrustedReleaseProvenance(
  song: MusicaichatSongJson | null,
  combinedFactsText: string,
): boolean {
  return (
    musicaichatSongHasStructuredReleaseYear(song) ||
    factsTextHasAlbumOrSingleReleaseContext(combinedFactsText)
  );
}

/**
 * 確証あるリリース年と、収録／シングル等の出自の両方が参照データで示せない場合に true（曲紹介のみへ）。
 */
export function shouldUseSongIntroOnlyDiscographyMode(params: {
  musicaichatSong: MusicaichatSongJson | null;
  /** Music8 事実ブロック・MusicBrainz 事実などを連結したテキスト */
  combinedFactsText: string;
}): boolean {
  const combined = (params.combinedFactsText ?? '').trim();
  const hasYear =
    musicaichatSongHasStructuredReleaseYear(params.musicaichatSong) || factsTextHasConcreteYear(combined);
  const hasProvenance = hasTrustedReleaseProvenance(params.musicaichatSong, combined);
  return !(hasYear && hasProvenance);
}

/** 曲解説・comment-pack 基本枠用の定型文（憶測なし・80字以上を目安） */
export function buildSongIntroOnlyBaseComment(artistLabel: string, songLabel: string): string {
  const a = (artistLabel ?? '').trim() || 'このアーティスト';
  const s = (songLabel ?? '').trim() || 'この曲';
  const body = `${a}の『${s}』です。参照データに確証あるリリース年と収録作品（アルバム・シングル等）の両方が揃っていないため、曲解説は曲名のご紹介にとどめます。`;
  if (body.length >= 80) return body;
  return `${body} 音源をお楽しみください。`;
}
