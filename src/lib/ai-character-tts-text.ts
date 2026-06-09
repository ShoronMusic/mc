/**
 * エージェントAI（character_chat）本文を Irodori-TTS 向けに整形する。
 */

import { parseArtistTitle } from '@/lib/format-song-display';

const AI_CHARACTER_PREFIX_RE = /^【AIキャラ】\s*/;

/** YouTube URL 行・watch?v= を含む行を除去（選曲案内は読み上げない） */
const YOUTUBE_LINE_RE =
  /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)[^\s]+/i;

/** 先頭の Artist - Title を除去するため、最初の日本語／句読点の位置を探す */
const JP_OR_PUNCT_START_RE = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF、。！？「」（）]/u;

/** 選曲案内の短いリード（日本語アーティスト名が無いときは読み上げない） */
const PICK_INTRO_LEAD_RE = /^(?:この曲を)?(?:を)?どうぞ[！!。]?\s*/u;

export type AiCharacterTtsPrepareOptions = {
  /** Music8 の artistjpname。あるときだけ「{ja}をどうぞ！」でアーティスト名を読む（曲名は読まない） */
  leadArtistJa?: string | null;
};

function hasLeadingArtistTitlePickLead(text: string): boolean {
  const jpIdx = text.search(JP_OR_PUNCT_START_RE);
  if (jpIdx <= 0) return false;
  const latinPrefix = text.slice(0, jpIdx).trim();
  if (!latinPrefix) return false;
  const parsed = parseArtistTitle(latinPrefix);
  return !!(parsed?.artist?.trim() && parsed?.song?.trim());
}

/** 選曲コメント先頭の「Oasis - Wonderwallをどうぞ！」などからアーティスト・曲名・区切りを落とす */
function stripLeadingArtistTitleForTts(text: string): string {
  const jpIdx = text.search(JP_OR_PUNCT_START_RE);
  if (jpIdx <= 0) return text;

  const latinPrefix = text.slice(0, jpIdx).trim();
  if (!latinPrefix) return text;

  const parsed = parseArtistTitle(latinPrefix);
  if (!parsed?.artist?.trim() || !parsed?.song?.trim()) return text;

  return text.slice(jpIdx).trimStart();
}

function stripLeadingPickIntroForTts(text: string): string {
  let t = text.trim();
  for (let i = 0; i < 2; i += 1) {
    const next = t.replace(PICK_INTRO_LEAD_RE, '').trim();
    if (next === t) break;
    t = next;
  }
  return t;
}

/** 文中の「Bon Joviの「It's My Life」、」など復唱を除去（英語読みのブレ対策） */
const ARTIST_OF_QUOTED_SONG_RE =
  /[A-Za-z][A-Za-z0-9\s.'&・‐‑–—-]{0,55}?の[「『"\u201c][^」』"\u201d\n]{1,100}[」』"\u201d][、,]?\s*/g;

const MID_ARTIST_DASH_TITLE_RE =
  /[A-Za-z][A-Za-z0-9\s.'&・‐‑–—-]{0,55}?\s*[-\u2013\u2014\u2015\uFF0D]\s*[A-Za-z0-9][\w\s.'!?&-]{0,70}?[、,]?\s*/g;

function stripArtistSongRecitationsForTts(text: string): string {
  let t = text.replace(ARTIST_OF_QUOTED_SONG_RE, '');
  if (!hasLeadingArtistTitlePickLead(t)) {
    t = t.replace(MID_ARTIST_DASH_TITLE_RE, '');
  }
  return t.replace(/\s+/g, ' ').trim();
}

export function prepareAiCharacterTtsText(
  displayBody: string,
  options?: AiCharacterTtsPrepareOptions,
): string {
  let t = displayBody.trim();
  if (!t) return '';
  t = t.replace(AI_CHARACTER_PREFIX_RE, '').trim();
  const lines = t
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !YOUTUBE_LINE_RE.test(line));
  t = lines.join(' ').replace(/\s+/g, ' ').trim();

  const leadArtistJa = options?.leadArtistJa?.trim();
  if (leadArtistJa && hasLeadingArtistTitlePickLead(t)) {
    const reason = stripArtistSongRecitationsForTts(
      stripLeadingPickIntroForTts(stripLeadingArtistTitleForTts(t)),
    );
    return reason ? `${leadArtistJa}をどうぞ！${reason}` : `${leadArtistJa}をどうぞ！`;
  }

  t = stripLeadingArtistTitleForTts(t);
  t = stripLeadingPickIntroForTts(t);
  t = stripArtistSongRecitationsForTts(t);
  return t;
}
