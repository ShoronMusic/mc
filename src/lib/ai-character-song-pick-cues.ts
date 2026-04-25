/**
 * AIキャラ自動選曲で messages に混ぜる「依頼」文。
 * 管理ログの投入コメントからは除外し、実際の参加者発言を拾う。
 */
export const CHARACTER_SONG_PICK_AUTO_USER_PROMPT =
  '参加者の選曲や会話のムードに一番寄せて、同じ路線（ジャンル・時代感）の洋楽を1曲だけ選曲してください。AIキャラが直前にかけた曲より、人間の参加者の流れを優先してください。';

/** 旧クライアントが送る可能性のある自動選曲依頼（後方互換） */
export const CHARACTER_SONG_PICK_AUTO_USER_PROMPT_LEGACY =
  'この部屋の流れに合う洋楽を1曲だけ選曲してください。';

const CHARACTER_SONG_PICK_PRAISE_CUE_PREFIX = 'いま流れ始めた曲について、選曲した人をさりげなく褒める短い一言をください。';

const CHARACTER_SONG_PICK_REACTION_CUE_PREFIX = '参加者の発言:';

/** character-song-pick に付与される内部キュー文か（会話ログ上の疑似ユーザー行の識別用） */
export function isCharacterSongPickCueBody(body: string): boolean {
  const t = body.trimStart();
  if (!t) return true;
  if (t.startsWith(CHARACTER_SONG_PICK_REACTION_CUE_PREFIX)) return true;
  if (t === CHARACTER_SONG_PICK_AUTO_USER_PROMPT_LEGACY) return true;
  if (t === CHARACTER_SONG_PICK_AUTO_USER_PROMPT) return true;
  if (t.startsWith(CHARACTER_SONG_PICK_PRAISE_CUE_PREFIX)) return true;
  return false;
}
