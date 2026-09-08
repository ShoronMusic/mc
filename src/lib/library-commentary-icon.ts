/**
 * 部屋ライブラリ曲一覧の「曲解説」アイコン。
 * 保存済み AI 解説、DB の Music8 曲紹介、または公開 JSON 見込み（slug 揃い）があれば出す。
 */
export function songHasMusic8IntroKey(row: {
  music8_artist_slug?: string | null;
  music8_song_slug?: string | null;
}): boolean {
  return Boolean((row.music8_artist_slug ?? '').trim() && (row.music8_song_slug ?? '').trim());
}

export function songHasLibraryCommentaryIcon(opts: {
  hasAiCommentary: boolean;
  music8ArtistSlug?: string | null;
  music8SongSlug?: string | null;
  hasDbMusic8Intro?: boolean;
}): boolean {
  return (
    opts.hasAiCommentary ||
    opts.hasDbMusic8Intro === true ||
    songHasMusic8IntroKey({
      music8_artist_slug: opts.music8ArtistSlug,
      music8_song_slug: opts.music8SongSlug,
    })
  );
}
