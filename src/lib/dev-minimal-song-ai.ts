/**
 * 開発用: `.env.local` に `NEXT_PUBLIC_DEV_MINIMAL_SONG_AI=1` を置くと、
 * 選曲直後の announce-song 文言を出さず、曲解説は comment-pack の基本1本のみ（自由4本・旧 commentary フォールバックなし）。
 * クライアント・API の双方から参照する（NEXT_PUBLIC は API ルートでも利用可）。
 */
export function isDevMinimalSongAi(): boolean {
  return process.env.NEXT_PUBLIC_DEV_MINIMAL_SONG_AI === '1';
}
