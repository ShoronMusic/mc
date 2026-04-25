/**
 * POST /api/ai/character-song-pick の JSON から、YouTube 解決済みペイロードだけを取り出す。
 * （ネストの取り違え・部分欠損をクライアント側で弾く）
 */
export type CharacterSongPickResolvedYoutube = {
  videoId: string;
  artistTitle: string;
  watchUrl: string;
};

export function extractCharacterSongPickResolvedYoutube(
  pick: unknown,
): CharacterSongPickResolvedYoutube | null {
  if (!pick || typeof pick !== 'object') return null;
  const y = (pick as { youtube?: unknown }).youtube;
  if (!y || typeof y !== 'object') return null;
  const yo = y as { ok?: unknown; videoId?: unknown; artistTitle?: unknown; watchUrl?: unknown };
  if (yo.ok !== true) return null;
  const videoId = typeof yo.videoId === 'string' ? yo.videoId.trim() : '';
  const artistTitle = typeof yo.artistTitle === 'string' ? yo.artistTitle.trim() : '';
  if (!videoId || !artistTitle) return null;
  const fromServer = typeof yo.watchUrl === 'string' ? yo.watchUrl.trim() : '';
  const watchUrl =
    fromServer ||
    `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
  return { videoId, artistTitle, watchUrl };
}
