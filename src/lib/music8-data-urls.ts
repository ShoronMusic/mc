/**
 * Music8 静的 JSON の HTTP ベース URL（GCS music8-json-prod）。
 * m8 の `dataUrls.js` 相当。Xserver ロールバック時のみ env で上書き。
 */

export const MUSIC8_GCS_DATA_HTTP_BASE =
  'https://storage.googleapis.com/music8-json-prod/data';

export const MUSIC8_SONGS_BASE = `${MUSIC8_GCS_DATA_HTTP_BASE}/songs`;

export const MUSIC8_ARTISTS_BASE = `${MUSIC8_GCS_DATA_HTTP_BASE}/artists`;

export const MUSIC8_MUSICAICHAT_V1_BASE = `${MUSIC8_GCS_DATA_HTTP_BASE}/musicaichat/v1`;

export const MUSIC8_MUSICAICHAT_ARTIST_INDEX_URL = `${MUSIC8_MUSICAICHAT_V1_BASE}/index/artist_index.json`;

/** サーバー／CLI: `MUSIC8_SONGS_BASE` 未設定時の曲 JSON ディレクトリ */
export function resolveMusic8SongsBaseUrl(): string {
  return process.env.MUSIC8_SONGS_BASE?.trim() || MUSIC8_SONGS_BASE;
}

/** bulk import: `MUSIC8_BULK_SONGS_BASE` → `MUSIC8_SONGS_BASE` → 既定 GCS */
export function resolveMusic8BulkSongsBaseUrl(): string {
  return (
    process.env.MUSIC8_BULK_SONGS_BASE?.trim() ||
    process.env.MUSIC8_SONGS_BASE?.trim() ||
    MUSIC8_SONGS_BASE
  );
}

/** bulk import: `MUSIC8_ARTIST_SONGS_BASE` → 既定 GCS artists */
export function resolveMusic8ArtistSongsBaseUrl(): string {
  return process.env.MUSIC8_ARTIST_SONGS_BASE?.trim() || MUSIC8_ARTISTS_BASE;
}

export function music8SongJsonUrl(artistSlug: string, songSlug: string): string {
  return `${MUSIC8_SONGS_BASE}/${artistSlug}_${songSlug}.json`;
}

export function music8ArtistJsonUrl(slug: string): string {
  return `${MUSIC8_ARTISTS_BASE}/${slug}.json`;
}

/** アーティスト曲一覧 `{slug}_songs.json`（ytvideoid / 正しい song slug 解決用） */
export function music8ArtistSongsListJsonUrl(artistSlug: string): string {
  const slug = artistSlug.trim();
  return `${resolveMusic8ArtistSongsBaseUrl()}/${encodeURIComponent(slug)}_songs.json`;
}
