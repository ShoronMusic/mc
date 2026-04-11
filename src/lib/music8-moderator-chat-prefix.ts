/**
 * AI_TIDBIT_MODERATOR のみ、最初の曲紹介（comment-pack 基本コメント）先頭に付けるデバッグ行。
 */

export type Music8ModeratorHints = {
  artistJsonHit: boolean;
  songJsonHit: boolean;
};

export function formatMusic8ModeratorIntroPrefix(
  isTidbitModerator: boolean,
  hints: Music8ModeratorHints | null | undefined,
): string {
  if (!isTidbitModerator || !hints) return '';
  const tags: string[] = [];
  if (hints.artistJsonHit) tags.push('アーチストJSON_Hit');
  if (hints.songJsonHit) tags.push('ソングJSON_Hit');
  if (tags.length === 0) return '';
  return `[Music8 ${tags.join(' ')}]\n`;
}
