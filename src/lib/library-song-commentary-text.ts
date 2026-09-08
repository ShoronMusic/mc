/**
 * 部屋ライブラリ曲詳細の「曲解説」本文の優先順位。
 * 管理画面で保存した `songs.music8_intro` を正本とし、未保存時だけ GCS JSON / AI 解説へ倒す。
 */

import {
  looksLikeCreditOnlyIntro,
  MUSIC8_INTRO_MIN_CHARS,
  normalizeMusic8IntroPlain,
} from '@/lib/music8-song-fields';

export function usableLibraryMusic8Intro(raw: string | null | undefined): string | null {
  const t = normalizeMusic8IntroPlain(raw ?? '');
  if (t.length < MUSIC8_INTRO_MIN_CHARS) return null;
  if (looksLikeCreditOnlyIntro(t)) return null;
  return t;
}

export function pickLibrarySongCommentaryText(opts: {
  dbMusic8Intro?: string | null;
  music8JsonDescription?: string | null;
  aiCommentary?: string | null;
}): string | null {
  const db = usableLibraryMusic8Intro(opts.dbMusic8Intro);
  if (db) return db;
  const fromJson = usableLibraryMusic8Intro(opts.music8JsonDescription);
  if (fromJson) return fromJson;
  const ai = (opts.aiCommentary ?? '').trim();
  return ai || null;
}
