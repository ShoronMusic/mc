/**
 * 曲解説が句点まで書き切れているか。
 * トークン上限で「ミシェル・」のように人名の途中で止まると、視聴中の解説が未完のまま残る。
 */

const COMPLETE_ENDING = /[。！？]["」』）】]*$/;

export function looksIncompleteSongCommentary(text: string): boolean {
  const t = (text ?? '').trim();
  if (!t) return true;
  if (/[、,，・：:（(「『\-―–]$/.test(t)) return true;
  return !COMPLETE_ENDING.test(t);
}

/** 末尾の未完断片を落とし、最後の句点までを返す。句点が無ければ空 */
export function trimCommentaryToLastCompleteSentence(text: string): string {
  const t = (text ?? '').trim();
  if (!t) return '';
  if (!looksIncompleteSongCommentary(t)) return t;
  let end = -1;
  for (const ch of ['。', '！', '？']) {
    end = Math.max(end, t.lastIndexOf(ch));
  }
  if (end < 0) return '';
  const cut = t.slice(0, end + 1).trim();
  if (cut.length < 6) return '';
  return looksIncompleteSongCommentary(cut) ? '' : cut;
}
