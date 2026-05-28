/** おすすめ曲のライブラリマッチ行表示（UI 用・依存最小） */

export function formatMcDbMatchDisplayLine(hit: {
  dbDisplayTitle?: string | null;
  dbMainArtist?: string | null;
  dbSongTitle?: string | null;
}): string {
  const display = hit.dbDisplayTitle?.trim();
  if (display) return display;
  const artist = hit.dbMainArtist?.trim() ?? '';
  const title = hit.dbSongTitle?.trim() ?? '';
  if (artist && title) return `${artist} - ${title}`;
  if (artist) return artist;
  if (title) return title;
  return '';
}
